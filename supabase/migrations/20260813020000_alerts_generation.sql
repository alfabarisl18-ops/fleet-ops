-- Fleet Operations SL — Phase 7 (Alerts)
--
-- Phase 1 built the full alerts schema (public.alerts, alert_type,
-- alert_severity, RLS, alerts_one_live_per_subject) with nothing ever
-- writing to it. This migration wires 4 of the 21 alert types to what's
-- already built (Vehicles/Drivers, Records spine, Daily payments,
-- Maintenance) — the rest belong to Accounting (Phase 8) and Future
-- Purchases (Phase 10) and get their generation logic when those phases
-- exist.
--
-- Two mechanisms, matched to what actually causes each alert:
--   - VEHICLE_GROUNDED and BALANCE_OUTSTANDING each have a single event
--     that causes them (a status flip, a balance being created/closed) —
--     plain AFTER triggers, immediate.
--   - MAINTENANCE_DUE, MAINTENANCE_OVERDUE and MISSED_PAYMENT are
--     genuinely date-driven — nothing is inserted when a reminder date
--     arrives or a day passes with no payment — so they need something to
--     periodically re-check. Confirmed with the user: pg_cron, daily.

-- ---------------------------------------------------------------------------
-- Schema amendment: automated resolution needs to be possible without a
-- human resolver. alerts_resolved_pair (Phase 1) required resolved_by
-- whenever resolved_at was set — correct for a person reviewing and
-- resolving an alert by hand, but the pg_cron job resolves alerts too
-- (a missed payment that gets backfilled, a maintenance order that
-- closes) with no human in the loop. Loosening the constraint to allow
-- resolved_at without resolved_by (system resolution) while still
-- forbidding resolved_by without resolved_at (can't resolve without a
-- timestamp) — same category of fix as decision 0010's append-only bug:
-- a real Phase 1 gap, fixed at the root, not worked around.
-- ---------------------------------------------------------------------------

alter table public.alerts drop constraint alerts_resolved_pair;
alter table public.alerts add constraint alerts_resolved_by_implies_resolved_at
  check (resolved_by is null or resolved_at is not null);

comment on column public.alerts.resolved_by is
  'Who resolved it, if a person did. Null when app.evaluate_scheduled_alerts() '
  'or a trigger resolved it automatically because the underlying condition '
  'cleared — resolved_at is always set either way.';

-- ---------------------------------------------------------------------------
-- pg_cron — https://supabase.com/docs/guides/cron/install
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ---------------------------------------------------------------------------
-- VEHICLE_GROUNDED — AFTER UPDATE OF is_grounded ON maintenance_orders.
-- SECURITY DEFINER: grounding can be caused by a Maintenance & Repairs
-- status change, and alerts_insert_desktop/alerts_update_desktop are both
-- desktop-only — same reasoning as every other SECURITY DEFINER fix this
-- project has made (decisions 0010, 0011). Subject is the maintenance
-- order, not the vehicle — SPEC's own phrasing for "the exact record" is
-- "the specific maintenance order, balance, or purchase goal".
-- Severity is OVERDUE from the moment it's raised: a grounded vehicle is
-- immediately urgent, not merely new (SPEC: "red for overdue or urgent").
-- ---------------------------------------------------------------------------

create or replace function app.alerts_after_maintenance_order_grounded_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := app.current_user_id();
begin
  if new.is_grounded is not distinct from old.is_grounded then
    return null;
  end if;

  if new.is_grounded then
    insert into public.alerts
      (client_record_id, type, severity, subject_type, subject_id, vehicle_id, visible_to_roles)
    values
      (gen_random_uuid(), 'VEHICLE_GROUNDED', 'OVERDUE', 'MAINTENANCE_ORDER', new.id, new.vehicle_id,
       array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[])
    on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;
  else
    update public.alerts
    set resolved_at = pg_catalog.now(), resolved_by = v_caller
    where type = 'VEHICLE_GROUNDED' and subject_type = 'MAINTENANCE_ORDER' and subject_id = new.id
      and resolved_at is null;
  end if;

  return null;
end;
$$;

create trigger maintenance_orders_alerts_after_grounded_change
  after update of is_grounded on public.maintenance_orders
  for each row execute function app.alerts_after_maintenance_order_grounded_change();

-- ---------------------------------------------------------------------------
-- BALANCE_OUTSTANDING — AFTER INSERT OR UPDATE OF status ON
-- outstanding_balances. SECURITY DEFINER for the same reason: balances
-- are created from record_daily_payment, called by Collections & Finance,
-- who cannot INSERT into alerts directly.
-- ---------------------------------------------------------------------------

create or replace function app.alerts_after_balance_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := app.current_user_id();
begin
  if new.status in ('OPEN', 'PARTIAL') then
    insert into public.alerts
      (client_record_id, type, severity, subject_type, subject_id, vehicle_id, driver_id, due_on, visible_to_roles)
    values
      (gen_random_uuid(), 'BALANCE_OUTSTANDING', 'NORMAL', 'OUTSTANDING_BALANCE', new.id, new.vehicle_id, new.driver_id,
       new.reminder_date, array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[])
    on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;
  else
    update public.alerts
    set resolved_at = pg_catalog.now(), resolved_by = v_caller
    where type = 'BALANCE_OUTSTANDING' and subject_type = 'OUTSTANDING_BALANCE' and subject_id = new.id
      and resolved_at is null;
  end if;

  return null;
end;
$$;

create trigger outstanding_balances_alerts_after_change
  after insert or update of status on public.outstanding_balances
  for each row execute function app.alerts_after_balance_change();

-- ---------------------------------------------------------------------------
-- The daily scheduled evaluation — MAINTENANCE_DUE, MAINTENANCE_OVERDUE,
-- MISSED_PAYMENT. Idempotent: safe to re-run manually (used for
-- verification below) as well as on its own schedule. SECURITY DEFINER
-- because pg_cron runs with no end-user JWT context at all — there is no
-- caller to check permissions against, so this function itself is the
-- trust boundary; nothing calls it except the schedule below.
-- ---------------------------------------------------------------------------

create or replace function app.evaluate_scheduled_alerts()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_today date := app.freetown_today();
begin
  -- MISSED_PAYMENT: active, day-outcome-eligible vehicles (mirrors
  -- isDayOutcomeEligible in src/data/dailyPayments.ts) with no record for
  -- yesterday's Freetown date.
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, vehicle_id, driver_id, due_on, visible_to_roles)
  select
    gen_random_uuid(), 'MISSED_PAYMENT', 'OVERDUE', 'VEHICLE', v.id, v.id, v.current_driver_id, v_today - 1,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.vehicles v
  where v.status = 'ACTIVE'
    and v.type <> 'BOX_TRUCK'
    and not exists (
      select 1 from public.daily_payment_records dpr
      where dpr.vehicle_id = v.id and dpr.service_date = v_today - 1
    )
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  -- Resolve once a record for that date shows up (late backfill).
  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'MISSED_PAYMENT' and a.resolved_at is null
    and exists (
      select 1 from public.daily_payment_records dpr
      where dpr.vehicle_id = a.subject_id and dpr.service_date = a.due_on
    );

  -- MAINTENANCE_DUE: open orders whose reminder date is within 3 days
  -- (a stated default, not a SPEC number — easy to tune). due_on and
  -- escalates_on both equal reminder_date, so a plain NORMAL-severity
  -- alert reads as OVERDUE the moment its own due date passes, without
  -- needing a second alert row.
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, vehicle_id, due_on, escalates_on, visible_to_roles)
  select
    gen_random_uuid(), 'MAINTENANCE_DUE',
    (case when o.reminder_date <= v_today then 'OVERDUE' else 'NORMAL' end)::public.alert_severity,
    'MAINTENANCE_ORDER', o.id, o.vehicle_id, o.reminder_date, o.reminder_date,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.maintenance_orders o
  where o.closed_at is null
    and o.reminder_date is not null
    and o.reminder_date <= v_today + 3
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts
  set severity = 'OVERDUE'
  where type = 'MAINTENANCE_DUE' and resolved_at is null and severity <> 'OVERDUE'
    and due_on is not null and due_on <= v_today;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'MAINTENANCE_DUE' and a.resolved_at is null
    and not exists (
      select 1 from public.maintenance_orders o
      where o.id = a.subject_id and o.closed_at is null
        and o.reminder_date is not null and o.reminder_date <= v_today + 3
    );

  -- MAINTENANCE_OVERDUE: open orders whose expected completion date has
  -- passed — a different underlying field from reminder_date, so a
  -- separate alert type, raised OVERDUE immediately.
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, vehicle_id, due_on, visible_to_roles)
  select
    gen_random_uuid(), 'MAINTENANCE_OVERDUE', 'OVERDUE', 'MAINTENANCE_ORDER', o.id, o.vehicle_id, o.expected_completion_on,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.maintenance_orders o
  where o.closed_at is null
    and o.expected_completion_on is not null
    and o.expected_completion_on < v_today
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  -- MAINTENANCE_OVERDUE supersedes a MAINTENANCE_DUE alert on the same order.
  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'MAINTENANCE_DUE' and a.resolved_at is null
    and exists (
      select 1 from public.alerts b
      where b.type = 'MAINTENANCE_OVERDUE' and b.subject_type = 'MAINTENANCE_ORDER'
        and b.subject_id = a.subject_id and b.resolved_at is null
    );

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'MAINTENANCE_OVERDUE' and a.resolved_at is null
    and exists (
      select 1 from public.maintenance_orders o
      where o.id = a.subject_id and o.closed_at is not null
    );
end;
$$;

comment on function app.evaluate_scheduled_alerts() is
  'Daily pg_cron job (see cron.schedule below). Raises MISSED_PAYMENT, '
  'MAINTENANCE_DUE and MAINTENANCE_OVERDUE and resolves each once its '
  'underlying condition clears. Idempotent -- safe to invoke manually.';

-- Africa/Freetown has no DST and pg_cron runs in GMT, so 06:00 here is
-- 06:00 Freetown local -- no timezone conversion needed. Re-running this
-- migration is safe: cron.schedule upserts by job name.
select cron.schedule('evaluate-fleet-alerts', '0 6 * * *', $$select app.evaluate_scheduled_alerts()$$);

-- ---------------------------------------------------------------------------
-- reviewed_at is a server-stamped event time (SERVER_STAMPED_COLUMNS in
-- src/types/db.ts already lists every other one of these -- entered_at,
-- changed_at, opened_at -- this is the same pattern, just via UPDATE
-- instead of INSERT since a review happens well after the alert exists).
-- The client sends only reviewed_by; this fills in reviewed_at the first
-- time it goes from null to set, exactly the guard app.reject_future_
-- business_date-style triggers use elsewhere. CLAUDE.md: never derive a
-- business date/time from new Date() on the client.
-- ---------------------------------------------------------------------------

create or replace function app.stamp_alert_reviewed_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.reviewed_by is not null and old.reviewed_by is null then
    new.reviewed_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

create trigger alerts_stamp_reviewed_at
  before update on public.alerts
  for each row execute function app.stamp_alert_reviewed_at();

-- ---------------------------------------------------------------------------
-- One-time backfill. The two triggers above only fire on a *change* — a
-- condition that was already true before this migration ran (a
-- maintenance order grounded during Phase 6 testing, an outstanding
-- balance already open) would otherwise never get an alert. This also
-- runs the scheduled evaluator once immediately, rather than waiting for
-- its first 06:00 run, so MISSED_PAYMENT/MAINTENANCE_DUE/MAINTENANCE_OVERDUE
-- reflect real data from the moment this migration applies.
-- ---------------------------------------------------------------------------

insert into public.alerts
  (client_record_id, type, severity, subject_type, subject_id, vehicle_id, visible_to_roles)
select gen_random_uuid(), 'VEHICLE_GROUNDED', 'OVERDUE', 'MAINTENANCE_ORDER', o.id, o.vehicle_id,
  array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
from public.maintenance_orders o
where o.is_grounded and o.closed_at is null
on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

insert into public.alerts
  (client_record_id, type, severity, subject_type, subject_id, vehicle_id, driver_id, due_on, visible_to_roles)
select gen_random_uuid(), 'BALANCE_OUTSTANDING', 'NORMAL', 'OUTSTANDING_BALANCE', b.id, b.vehicle_id, b.driver_id,
  b.reminder_date, array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
from public.outstanding_balances b
where b.status in ('OPEN', 'PARTIAL')
on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

select app.evaluate_scheduled_alerts();
