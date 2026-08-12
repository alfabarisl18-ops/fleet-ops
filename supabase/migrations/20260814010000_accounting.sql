-- Fleet Operations SL — Phase 8 (Accounting)
--
-- Phase 1 built ledger_entries with everything this phase needs already
-- in place (reconciled_at/reconciled_by, approval_status, category,
-- direction, superseded_by_id) -- nothing in src/ has ever aggregated
-- it; every prior phase only ever wrote individual rows. This migration
-- adds three RPCs, one new trigger, and extends Phase 7's scheduled
-- alert evaluation with one more type.
--
-- Confirmed with the user: yearly targets track the calendar year;
-- box-truck trip recording gets built now (closes the Phase 5 deferral
-- -- without it "Truck Income" would be permanently empty); an expense
-- is flagged unusual/disputed by a desktop reviewer after entry, not by
-- whoever recorded it.

-- ---------------------------------------------------------------------------
-- record_trip -- SECURITY INVOKER, matching record_daily_payment's own
-- reasoning: both desktop and Collections & Finance already have INSERT
-- grants on trips and ledger_entries (trips_insert_desktop_or_collections,
-- ledger_insert_collections/desktop -- SPEC's Trips section was rewritten
-- after the original Phase 1 build; 20260809091500_trips_match_resolved_spec.sql
-- moved trip entry onto the MOBILE Collections & Finance screen, "under
-- Sprinter & Box-Truck Payment -> box truck selected", and renamed/added
-- columns accordingly (pickup_location/destination_location, no cargo,
-- plus load_quantity/load_weight/load_weight_unit). No RLS mismatch to
-- work around either way. Trip expense categories are the exact three
-- SPEC names: ROAD_CHECKPOINT, DRIVER_OR_HELPER_PAYMENT, FUEL -- already
-- valid EXPENSE categories, no schema change needed. Revenue and cost
-- are never stored on the trip row, only as linked ledger_entries with
-- source_type = 'TRIP'.
-- ---------------------------------------------------------------------------

create or replace function public.record_trip(
  p_client_record_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_helper_name text,
  p_pickup_location text,
  p_destination_location text,
  p_departed_on date,
  p_returned_on date,
  p_load_quantity integer,
  p_load_weight numeric,
  p_load_weight_unit public.weight_unit,
  p_notes text,
  p_revenue_minor bigint,
  p_expenses jsonb default '[]'::jsonb
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_caller uuid := app.current_user_id();
  v_expense jsonb;
  v_category text;
  v_amount bigint;
begin
  insert into public.trips
    (client_record_id, vehicle_id, driver_id, helper_name, pickup_location, destination_location,
     departed_on, returned_on, load_quantity, load_weight, load_weight_unit, notes, status, entered_by)
  values
    (p_client_record_id, p_vehicle_id, p_driver_id, p_helper_name, p_pickup_location, p_destination_location,
     p_departed_on, p_returned_on, p_load_quantity, p_load_weight, p_load_weight_unit, p_notes,
     (case when p_returned_on is not null then 'COMPLETED' else 'IN_PROGRESS' end)::public.trip_status, v_caller)
  returning id into v_trip_id;

  if p_revenue_minor > 0 then
    insert into public.ledger_entries
      (client_record_id, direction, amount_minor, category, applies_to_date, received_at,
       entered_by_user_id, vehicle_id, driver_id, source_type, source_id)
    values
      (gen_random_uuid(), 'INCOME', p_revenue_minor, 'TRIP_REVENUE', p_departed_on, app.freetown_today(),
       v_caller, p_vehicle_id, p_driver_id, 'TRIP', v_trip_id);
  end if;

  for v_expense in select * from jsonb_array_elements(p_expenses)
  loop
    v_category := v_expense ->> 'category';
    v_amount := (v_expense ->> 'amount_minor')::bigint;

    if v_category not in ('ROAD_CHECKPOINT', 'DRIVER_OR_HELPER_PAYMENT', 'FUEL') then
      raise exception 'Invalid trip expense category: %', v_category using errcode = 'check_violation';
    end if;

    if v_amount > 0 then
      insert into public.ledger_entries
        (client_record_id, direction, amount_minor, category, applies_to_date, received_at,
         entered_by_user_id, vehicle_id, driver_id, source_type, source_id, note)
      values
        (gen_random_uuid(), 'EXPENSE', v_amount, v_category::public.ledger_category, p_departed_on, app.freetown_today(),
         v_caller, p_vehicle_id, p_driver_id, 'TRIP', v_trip_id, v_expense ->> 'note');
    end if;
  end loop;

  return v_trip_id;
end;
$$;

comment on function public.record_trip(uuid, uuid, uuid, text, text, text, date, date, integer, numeric, public.weight_unit, text, bigint, jsonb) is
  'Records a box-truck trip plus its revenue and expense ledger entries '
  'in one transaction. SECURITY INVOKER -- both desktop and Collections & '
  'Finance already have the grants this needs, no RLS mismatch to bypass. '
  'Mobile entry point per SPEC: Collections & Finance, under Sprinter & '
  'Box-Truck Payment -> box truck selected.';

revoke all on function public.record_trip(uuid, uuid, uuid, text, text, text, date, date, integer, numeric, public.weight_unit, text, bigint, jsonb) from public, anon;
grant execute on function public.record_trip(uuid, uuid, uuid, text, text, text, date, date, integer, numeric, public.weight_unit, text, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- flag_ledger_entry / approve_flagged_expense -- both SECURITY INVOKER,
-- same reasoning: ledger_update_desktop already grants desktop roles
-- UPDATE, these functions only add narrower checks RLS itself doesn't
-- express. No new reason-text column -- SPEC doesn't call for one here
-- the way corrections require a `reason`; a stated limitation, not an
-- oversight (decision 0013).
-- ---------------------------------------------------------------------------

create or replace function public.flag_ledger_entry(
  p_ledger_entry_id uuid,
  p_status public.approval_status
)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if not coalesce(app.is_desktop(), false) then
    raise exception 'Only desktop roles may flag a transaction' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('PENDING', 'DISPUTED') then
    raise exception 'flag_ledger_entry only sets PENDING or DISPUTED' using errcode = 'check_violation';
  end if;

  update public.ledger_entries set approval_status = p_status where id = p_ledger_entry_id;
end;
$$;

revoke all on function public.flag_ledger_entry(uuid, public.approval_status) from public, anon;
grant execute on function public.flag_ledger_entry(uuid, public.approval_status) to authenticated;

-- SPEC, taken literally: "Only unusual or disputed expenses require
-- Fleet Manager approval" -- Fleet Manager specifically, not
-- Owner/Admin-or-Fleet-Manager the way Phase 5's shortfall override is.
create or replace function public.approve_flagged_expense(
  p_ledger_entry_id uuid
)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if app.current_app_role() <> 'FLEET_MANAGER' then
    raise exception 'Only Fleet Manager may approve a flagged expense' using errcode = 'insufficient_privilege';
  end if;

  update public.ledger_entries
  set approval_status = 'APPROVED'
  where id = p_ledger_entry_id and approval_status in ('PENDING', 'DISPUTED');
end;
$$;

revoke all on function public.approve_flagged_expense(uuid) from public, anon;
grant execute on function public.approve_flagged_expense(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- UNUSUAL_EXPENSE / DISPUTED_EXPENSE -- AFTER UPDATE OF approval_status
-- ON ledger_entries. Plain trigger, not SECURITY DEFINER: both actions
-- that change approval_status (flag_ledger_entry, approve_flagged_expense)
-- are already desktop-only, so the caller inserting/resolving an alert
-- here is already a role alerts_insert_desktop/alerts_update_desktop
-- permit -- no RLS mismatch, unlike Phase 7's VEHICLE_GROUNDED case.
-- ---------------------------------------------------------------------------

create or replace function app.alerts_after_ledger_approval_change()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_caller uuid := app.current_user_id();
  v_type public.alert_type;
begin
  if new.approval_status is not distinct from old.approval_status then
    return null;
  end if;

  if new.approval_status in ('PENDING', 'DISPUTED') then
    v_type := case when new.approval_status = 'PENDING' then 'UNUSUAL_EXPENSE' else 'DISPUTED_EXPENSE' end;

    -- Resolve the other type first, if present, so re-flagging doesn't
    -- leave two live alerts on the same entry.
    update public.alerts
    set resolved_at = pg_catalog.now(), resolved_by = v_caller
    where subject_type = 'LEDGER_ENTRY' and subject_id = new.id and resolved_at is null
      and type in ('UNUSUAL_EXPENSE', 'DISPUTED_EXPENSE');

    insert into public.alerts
      (client_record_id, type, severity, subject_type, subject_id, vehicle_id, driver_id, visible_to_roles)
    values
      (gen_random_uuid(), v_type, 'NORMAL', 'LEDGER_ENTRY', new.id, new.vehicle_id, new.driver_id,
       array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[])
    on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;
  elsif new.approval_status = 'APPROVED' then
    update public.alerts
    set resolved_at = pg_catalog.now(), resolved_by = v_caller
    where subject_type = 'LEDGER_ENTRY' and subject_id = new.id and resolved_at is null
      and type in ('UNUSUAL_EXPENSE', 'DISPUTED_EXPENSE');
  end if;

  return null;
end;
$$;

create trigger ledger_entries_alerts_after_approval_change
  after update of approval_status on public.ledger_entries
  for each row execute function app.alerts_after_ledger_approval_change();

-- ---------------------------------------------------------------------------
-- VEHICLE_BELOW_TARGET, added to Phase 7's daily scheduled evaluation
-- (decision 0012: ask trigger-vs-cron fresh per type -- there is no
-- single event that makes a vehicle "behind," so this joins
-- MAINTENANCE_DUE/MAINTENANCE_OVERDUE/MISSED_PAYMENT under the cron
-- job rather than getting its own trigger). Calendar-year-to-date
-- INCOME vs. a pro-rated fraction of yearly_target_minor (days elapsed
-- / 365) -- confirmed with the user: calendar year, not a rolling
-- window from entered_service_on. superseded_by_id is excluded so a
-- corrected-away ledger row never counts twice.
--
-- This function's full body is repeated here (CREATE OR REPLACE
-- requires the whole thing) -- the MISSED_PAYMENT/MAINTENANCE_DUE/
-- MAINTENANCE_OVERDUE blocks are unchanged from the Phase 7 migration.
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

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'MISSED_PAYMENT' and a.resolved_at is null
    and exists (
      select 1 from public.daily_payment_records dpr
      where dpr.vehicle_id = a.subject_id and dpr.service_date = a.due_on
    );

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

  -- VEHICLE_BELOW_TARGET (Phase 8).
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, vehicle_id, visible_to_roles)
  select
    gen_random_uuid(), 'VEHICLE_BELOW_TARGET', 'NORMAL', 'VEHICLE', v.id, v.id,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.vehicles v
  where v.status <> 'ARCHIVED'
    and v.yearly_target_minor > 0
    and coalesce((
      select sum(l.amount_minor) from public.ledger_entries l
      where l.vehicle_id = v.id and l.direction = 'INCOME'
        and l.applies_to_date >= date_trunc('year', v_today)::date
        and l.applies_to_date <= v_today
        and l.superseded_by_id is null
    ), 0) < (v.yearly_target_minor::numeric * (extract(doy from v_today) / 365.0))
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'VEHICLE_BELOW_TARGET' and a.resolved_at is null
    and not exists (
      select 1 from public.vehicles v
      where v.id = a.subject_id and v.status <> 'ARCHIVED' and v.yearly_target_minor > 0
        and coalesce((
          select sum(l.amount_minor) from public.ledger_entries l
          where l.vehicle_id = v.id and l.direction = 'INCOME'
            and l.applies_to_date >= date_trunc('year', v_today)::date
            and l.applies_to_date <= v_today
            and l.superseded_by_id is null
        ), 0) < (v.yearly_target_minor::numeric * (extract(doy from v_today) / 365.0))
    );
end;
$$;

comment on function app.evaluate_scheduled_alerts() is
  'Daily pg_cron job. Raises MISSED_PAYMENT, MAINTENANCE_DUE, '
  'MAINTENANCE_OVERDUE, and (Phase 8) VEHICLE_BELOW_TARGET, resolving '
  'each once its underlying condition clears. Idempotent.';

-- Re-run once immediately so VEHICLE_BELOW_TARGET reflects real data
-- from the moment this migration applies, same as Phase 7's own backfill.
select app.evaluate_scheduled_alerts();

-- ---------------------------------------------------------------------------
-- reconciled_at is a server-stamped event time, same reasoning and same
-- shape as alerts.reviewed_at (Phase 7): no existing trigger stamps it
-- (it's set via UPDATE, well after the row exists), and the client must
-- never supply it directly. reconciled_at is already in
-- ledger_entries_append_only's mutable allow-list, so this trigger
-- changing it before or after that one runs doesn't create the Phase 5
-- generated-column false-positive (decision 0010) -- the column is
-- allow-listed, not compared, either way.
-- ---------------------------------------------------------------------------

create or replace function app.stamp_ledger_reconciled_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.reconciled_by is not null and old.reconciled_by is null then
    new.reconciled_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

create trigger ledger_entries_stamp_reconciled_at
  before update on public.ledger_entries
  for each row execute function app.stamp_ledger_reconciled_at();
