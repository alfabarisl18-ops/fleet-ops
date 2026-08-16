-- Fleet Operations SL — Phase 10 (Future Purchases)
--
-- Phase 1 built the entire schema this phase needs already in place --
-- purchase_goals, planned_vehicles, acquisition_cost_lines,
-- acquisition_payments, savings_targets, cash_reservations,
-- transit_records, documents -- all desktop-only via RLS, with structural
-- rule 6 (acquisition costs link back to ledger_entries so nothing is
-- double-counted) and structural rule 8 (available cash is derived, never
-- stored) already encoded in comments. Nothing in src/ has ever written to
-- any of them. This migration adds two RPCs, one new invariant, two event
-- triggers, and wires the 12 remaining alert types alerts_generation.sql's
-- own comment named this phase for.
--
-- Confirmed with the user: real Supabase Storage upload for documents in
-- this phase (a private bucket + desktop-only policies), not just the
-- metadata screens.

-- ---------------------------------------------------------------------------
-- One new invariant, not a new table. planned_vehicles.stage can only
-- reach ACTIVE_IN_SERVICE together with onboarded_vehicle_id being set --
-- onboard_vehicle() below is the only path that sets both together, so
-- this blocks any other route (a plain client update, a typo'd RPC) from
-- putting a planned vehicle "in service" without a real vehicles row
-- behind it.
-- ---------------------------------------------------------------------------

alter table public.planned_vehicles add constraint pv_active_in_service_is_onboarded
  check ((stage = 'ACTIVE_IN_SERVICE') = (onboarded_vehicle_id is not null));

-- ---------------------------------------------------------------------------
-- record_acquisition_payment -- SECURITY INVOKER: acquisition_payments and
-- ledger_entries both already grant desktop roles INSERT
-- (ap_insert/ledger_insert_desktop), no RLS mismatch to bypass, same
-- reasoning record_trip documents. Links the payment to its ledger expense
-- the same way record_maintenance_part links a part -- insert both, then
-- update ledger_entry_id, the one column acquisition_payments_append_only
-- permits changing after insert. vehicle_id on the ledger row is only set
-- once the planned vehicle has actually been onboarded (most acquisition
-- payments happen before that vehicle exists) -- null otherwise, same as
-- every other ledger entry with no vehicle yet.
-- ---------------------------------------------------------------------------

create or replace function public.record_acquisition_payment(
  p_client_record_id uuid,
  p_planned_vehicle_id uuid,
  p_payment_type public.acquisition_payment_type,
  p_amount_minor bigint,
  p_paid_on date,
  p_method text,
  p_paid_to text,
  p_original_currency text,
  p_original_amount_minor bigint,
  p_exchange_rate numeric,
  p_next_due_on date
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_id uuid;
  v_caller uuid := app.current_user_id();
  v_ledger_entry_id uuid;
  v_vehicle_id uuid;
begin
  select onboarded_vehicle_id into v_vehicle_id
  from public.planned_vehicles where id = p_planned_vehicle_id;

  insert into public.acquisition_payments
    (client_record_id, planned_vehicle_id, payment_type, amount_minor, paid_on, method, paid_to,
     original_currency, original_amount_minor, exchange_rate, next_due_on, entered_by)
  values
    (p_client_record_id, p_planned_vehicle_id, p_payment_type, p_amount_minor, p_paid_on, p_method, p_paid_to,
     p_original_currency, p_original_amount_minor, p_exchange_rate, p_next_due_on, v_caller)
  returning id into v_id;

  insert into public.ledger_entries
    (client_record_id, direction, amount_minor, category, applies_to_date, received_at,
     entered_by_user_id, vehicle_id, source_type, source_id)
  values
    (gen_random_uuid(), 'EXPENSE', p_amount_minor, 'VEHICLE_PURCHASE', p_paid_on, app.freetown_today(),
     v_caller, v_vehicle_id, 'ACQUISITION_PAYMENT', v_id)
  returning id into v_ledger_entry_id;

  update public.acquisition_payments set ledger_entry_id = v_ledger_entry_id where id = v_id;

  return v_id;
end;
$$;

comment on function public.record_acquisition_payment(uuid, uuid, public.acquisition_payment_type, bigint, date, text, text, text, bigint, numeric, date) is
  'Records a deposit/installment/final payment against a planned vehicle '
  'and its matching VEHICLE_PURCHASE ledger expense, linked back. '
  'SECURITY INVOKER -- desktop already has the grants this needs.';

revoke all on function public.record_acquisition_payment(uuid, uuid, public.acquisition_payment_type, bigint, date, text, text, text, bigint, numeric, date) from public, anon;
grant execute on function public.record_acquisition_payment(uuid, uuid, public.acquisition_payment_type, bigint, date, text, text, text, bigint, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- onboard_vehicle -- SECURITY INVOKER: vehicles and planned_vehicles both
-- already grant desktop roles INSERT/UPDATE, no RLS mismatch to bypass.
-- Only reachable at stage READY_FOR_ONBOARDING. Carries over exactly what
-- SPEC calls "operational" -- fleet ID, plate, driver, route, targets,
-- service date, status. Deliberately does NOT add make/model/VIN/engine
-- number/mileage/fuel/transmission/condition columns to vehicles: those
-- stay on planned_vehicles/transit_records/purchase_goals permanently as
-- the vehicle's "full acquisition history attached" (SPEC's own phrase) --
-- duplicating them onto vehicles would violate the no-duplicate-source-
-- of-truth rule and immediately go stale. purchase_price_minor is the
-- summed actual landed cost (structural rule 6's whole point: the capital
-- figure comes from what was actually paid, not the estimate).
-- ---------------------------------------------------------------------------

create or replace function public.onboard_vehicle(
  p_client_record_id uuid,
  p_planned_vehicle_id uuid,
  p_fleet_id text,
  p_plate text,
  p_current_driver_id uuid,
  p_route_id uuid,
  p_expected_daily_amount_minor bigint,
  p_yearly_target_minor bigint,
  p_entered_service_on date,
  p_status public.vehicle_status
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_planned record;
  v_vehicle_id uuid;
  v_landed_cost_minor bigint;
begin
  select pv.stage, pv.purchased_at, g.vehicle_type, g.custom_type
    into v_planned
  from public.planned_vehicles pv
  join public.purchase_goals g on g.id = pv.goal_id
  where pv.id = p_planned_vehicle_id;

  if v_planned is null then
    raise exception 'Planned vehicle not found' using errcode = 'no_data_found';
  end if;

  if v_planned.stage <> 'READY_FOR_ONBOARDING' then
    raise exception 'Only a planned vehicle at Ready for onboarding may be onboarded (currently %)', v_planned.stage
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(actual_minor), 0) into v_landed_cost_minor
  from public.acquisition_cost_lines
  where planned_vehicle_id = p_planned_vehicle_id;

  insert into public.vehicles
    (client_record_id, fleet_id, plate, type, custom_type, current_driver_id, route_id,
     purchased_on, purchase_price_minor, entered_service_on, status,
     expected_daily_amount_minor, yearly_target_minor)
  values
    (p_client_record_id, p_fleet_id, p_plate, v_planned.vehicle_type, v_planned.custom_type,
     p_current_driver_id, p_route_id, v_planned.purchased_at, v_landed_cost_minor, p_entered_service_on,
     p_status, p_expected_daily_amount_minor, p_yearly_target_minor)
  returning id into v_vehicle_id;

  update public.planned_vehicles
  set stage = 'ACTIVE_IN_SERVICE', onboarded_vehicle_id = v_vehicle_id
  where id = p_planned_vehicle_id;

  return v_vehicle_id;
end;
$$;

comment on function public.onboard_vehicle(uuid, uuid, text, text, uuid, uuid, bigint, bigint, date, public.vehicle_status) is
  'Creates the real vehicles row from a planned vehicle at Ready for '
  'onboarding and links it back via onboarded_vehicle_id. SECURITY '
  'INVOKER -- desktop already has the grants this needs. The new check '
  'constraint pv_active_in_service_is_onboarded means this is the only '
  'path into stage ACTIVE_IN_SERVICE.';

revoke all on function public.onboard_vehicle(uuid, uuid, text, text, uuid, uuid, bigint, bigint, date, public.vehicle_status) from public, anon;
grant execute on function public.onboard_vehicle(uuid, uuid, text, text, uuid, uuid, bigint, bigint, date, public.vehicle_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Event-driven alerts. SECURITY INVOKER (not DEFINER, unlike Phase 7's
-- VEHICLE_GROUNDED/BALANCE_OUTSTANDING) -- those needed DEFINER because a
-- mobile role could cause them. Every write to planned_vehicles/
-- transit_records only ever comes from a desktop role already (RLS is
-- desktop-only on both tables), and alerts_insert_desktop only requires
-- app.is_desktop() -- the invoking user already satisfies it, so there is
-- no privilege gap to bridge.
-- ---------------------------------------------------------------------------

create or replace function app.alerts_after_planned_vehicle_stage_change()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if new.stage is not distinct from old.stage then
    return null;
  end if;

  if new.stage = 'READY_FOR_ONBOARDING' then
    insert into public.alerts
      (client_record_id, type, severity, subject_type, subject_id, visible_to_roles)
    values
      (gen_random_uuid(), 'VEHICLE_READY_FOR_ONBOARDING', 'NORMAL', 'PLANNED_VEHICLE', new.id,
       array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[])
    on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;
  else
    update public.alerts
    set resolved_at = pg_catalog.now(), resolved_by = app.current_user_id()
    where type = 'VEHICLE_READY_FOR_ONBOARDING' and subject_type = 'PLANNED_VEHICLE' and subject_id = new.id
      and resolved_at is null;
  end if;

  return null;
end;
$$;

create trigger planned_vehicles_alerts_after_stage_change
  after update of stage on public.planned_vehicles
  for each row execute function app.alerts_after_planned_vehicle_stage_change();

-- SHIPPING_DEPARTURE is purely informational -- "the vehicle has shipped,"
-- once, on the day it happens. There is no underlying condition to clear,
-- so unlike every other alert this one has no auto-resolve path -- a
-- desktop reviewer clears it by hand (reviewed_at), same as any alert
-- nothing else here would otherwise resolve.
create or replace function app.alerts_after_transit_shipped_change()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if new.shipped_on is not null and old.shipped_on is null then
    insert into public.alerts
      (client_record_id, type, severity, subject_type, subject_id, due_on, visible_to_roles)
    values
      (gen_random_uuid(), 'SHIPPING_DEPARTURE', 'NORMAL', 'TRANSIT_RECORD', new.id, new.shipped_on,
       array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[])
    on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;
  end if;

  return null;
end;
$$;

create trigger transit_records_alerts_after_shipped_change
  after update of shipped_on on public.transit_records
  for each row execute function app.alerts_after_transit_shipped_change();

-- ---------------------------------------------------------------------------
-- Date/condition-driven alerts, added to the daily pg_cron job. Every
-- threshold below (14/7/5/3 days, the monthly-shortfall-times-one savings
-- test) is a stated default I'm choosing, not a SPEC number -- same as
-- MAINTENANCE_DUE's existing 3-day window, flagged in decision 0015 for
-- the user to retune. This function's full body is repeated here (CREATE
-- OR REPLACE requires the whole thing) -- every block above the Phase 10
-- comment is unchanged from Phase 7/8.
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

  -- --- Phase 10: Future Purchases -----------------------------------------

  -- PURCHASE_DATE_WITHOUT_FUNDS: target_purchase_date within 14 days,
  -- reserved cash short of the goal's own budget.
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, due_on, visible_to_roles)
  select
    gen_random_uuid(), 'PURCHASE_DATE_WITHOUT_FUNDS', 'NORMAL', 'PURCHASE_GOAL', g.id, g.target_purchase_date,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.purchase_goals g
  join public.savings_targets st on st.goal_id = g.id
  where g.status = 'ACTIVE'
    and g.target_purchase_date is not null
    and g.target_purchase_date <= v_today + 14
    and coalesce((
      select sum(cr.amount_minor) from public.cash_reservations cr
      where cr.goal_id = g.id and cr.released_at is null
    ), 0) < st.total_budget_minor
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'PURCHASE_DATE_WITHOUT_FUNDS' and a.resolved_at is null
    and not exists (
      select 1 from public.purchase_goals g
      join public.savings_targets st on st.goal_id = g.id
      where g.id = a.subject_id and g.status = 'ACTIVE'
        and g.target_purchase_date is not null and g.target_purchase_date <= v_today + 14
        and coalesce((
          select sum(cr.amount_minor) from public.cash_reservations cr
          where cr.goal_id = g.id and cr.released_at is null
        ), 0) < st.total_budget_minor
    );

  -- SAVINGS_BEHIND: linearly-expected-by-now amount (pro-rated from the
  -- target's created_at to target_date) exceeds actual reserved cash by
  -- more than one month's stated target (or, absent one, a flat 10% of
  -- budget -- a stated fallback, not a SPEC number).
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, due_on, visible_to_roles)
  select
    gen_random_uuid(), 'SAVINGS_BEHIND', 'NORMAL', 'PURCHASE_GOAL', g.id, st.target_date,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.purchase_goals g
  join public.savings_targets st on st.goal_id = g.id
  where g.status = 'ACTIVE'
    and st.target_date is not null
    and st.target_date > st.created_at::date
    and (st.total_budget_minor::numeric * least(v_today - st.created_at::date, st.target_date - st.created_at::date)
         / (st.target_date - st.created_at::date))
        - coalesce((
            select sum(cr.amount_minor) from public.cash_reservations cr
            where cr.goal_id = g.id and cr.released_at is null
          ), 0)
      > coalesce(st.monthly_target_minor, st.total_budget_minor / 10)
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'SAVINGS_BEHIND' and a.resolved_at is null
    and not exists (
      select 1 from public.purchase_goals g
      join public.savings_targets st on st.goal_id = g.id
      where g.id = a.subject_id and g.status = 'ACTIVE'
        and st.target_date is not null and st.target_date > st.created_at::date
        and (st.total_budget_minor::numeric * least(v_today - st.created_at::date, st.target_date - st.created_at::date)
             / (st.target_date - st.created_at::date))
            - coalesce((
                select sum(cr.amount_minor) from public.cash_reservations cr
                where cr.goal_id = g.id and cr.released_at is null
              ), 0)
          > coalesce(st.monthly_target_minor, st.total_budget_minor / 10)
    );

  -- DEPOSIT_OR_INSTALLMENT_DUE: each planned vehicle's most recent payment
  -- (by entered_at) still names a next_due_on within 3 days -- a later
  -- payment naturally supersedes it by becoming the new "most recent".
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, due_on, visible_to_roles)
  select
    gen_random_uuid(), 'DEPOSIT_OR_INSTALLMENT_DUE',
    (case when lp.next_due_on <= v_today then 'OVERDUE' else 'NORMAL' end)::public.alert_severity,
    'PLANNED_VEHICLE', lp.planned_vehicle_id, lp.next_due_on,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from (
    select distinct on (ap.planned_vehicle_id) ap.planned_vehicle_id, ap.next_due_on
    from public.acquisition_payments ap
    order by ap.planned_vehicle_id, ap.entered_at desc
  ) lp
  join public.planned_vehicles pv on pv.id = lp.planned_vehicle_id
  where lp.next_due_on is not null
    and lp.next_due_on <= v_today + 3
    and pv.stage in ('IDEA_CONSIDERING', 'RESEARCHING', 'SAVING', 'READY_TO_PURCHASE', 'SELLER_SELECTED', 'DEPOSIT_PAID')
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'DEPOSIT_OR_INSTALLMENT_DUE' and a.resolved_at is null
    and not exists (
      select 1 from (
        select distinct on (ap.planned_vehicle_id) ap.planned_vehicle_id, ap.next_due_on
        from public.acquisition_payments ap
        order by ap.planned_vehicle_id, ap.entered_at desc
      ) lp
      join public.planned_vehicles pv on pv.id = lp.planned_vehicle_id
      where lp.planned_vehicle_id = a.subject_id
        and lp.next_due_on is not null and lp.next_due_on <= v_today + 3
        and pv.stage in ('IDEA_CONSIDERING', 'RESEARCHING', 'SAVING', 'READY_TO_PURCHASE', 'SELLER_SELECTED', 'DEPOSIT_PAID')
    );

  -- EXPECTED_PORT_ARRIVAL / ARRIVAL_DELAY -- same underlying date, two
  -- alerts either side of it, ARRIVAL_DELAY superseding EXPECTED_PORT_ARRIVAL
  -- once it passes (same supersede shape as MAINTENANCE_DUE/OVERDUE above).
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, due_on, visible_to_roles)
  select
    gen_random_uuid(), 'EXPECTED_PORT_ARRIVAL', 'NORMAL', 'TRANSIT_RECORD', tr.id, tr.expected_arrival,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.transit_records tr
  where tr.expected_arrival is not null
    and tr.actual_arrival is null
    and tr.expected_arrival between v_today and v_today + 5
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'EXPECTED_PORT_ARRIVAL' and a.resolved_at is null
    and (
      exists (select 1 from public.transit_records tr where tr.id = a.subject_id and tr.actual_arrival is not null)
      or exists (
        select 1 from public.alerts b
        where b.type = 'ARRIVAL_DELAY' and b.subject_type = 'TRANSIT_RECORD' and b.subject_id = a.subject_id and b.resolved_at is null
      )
    );

  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, due_on, visible_to_roles)
  select
    gen_random_uuid(), 'ARRIVAL_DELAY', 'OVERDUE', 'TRANSIT_RECORD', tr.id, tr.expected_arrival,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.transit_records tr
  where tr.expected_arrival is not null
    and tr.actual_arrival is null
    and tr.expected_arrival < v_today
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'ARRIVAL_DELAY' and a.resolved_at is null
    and exists (select 1 from public.transit_records tr where tr.id = a.subject_id and tr.actual_arrival is not null);

  -- CUSTOMS_DEADLINE / DEMURRAGE_RISK: days since actual arrival while
  -- still sitting at ARRIVED_AT_PORT or CUSTOMS_CLEARING.
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, visible_to_roles)
  select
    gen_random_uuid(), 'CUSTOMS_DEADLINE', 'NORMAL', 'TRANSIT_RECORD', tr.id,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.transit_records tr
  join public.planned_vehicles pv on pv.id = tr.planned_vehicle_id
  where pv.stage in ('ARRIVED_AT_PORT', 'CUSTOMS_CLEARING')
    and tr.actual_arrival is not null
    and v_today - tr.actual_arrival >= 7
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'CUSTOMS_DEADLINE' and a.resolved_at is null
    and not exists (
      select 1 from public.transit_records tr
      join public.planned_vehicles pv on pv.id = tr.planned_vehicle_id
      where tr.id = a.subject_id and pv.stage in ('ARRIVED_AT_PORT', 'CUSTOMS_CLEARING')
        and tr.actual_arrival is not null and v_today - tr.actual_arrival >= 7
    );

  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, visible_to_roles)
  select
    gen_random_uuid(), 'DEMURRAGE_RISK', 'OVERDUE', 'TRANSIT_RECORD', tr.id,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.transit_records tr
  join public.planned_vehicles pv on pv.id = tr.planned_vehicle_id
  where pv.stage in ('ARRIVED_AT_PORT', 'CUSTOMS_CLEARING')
    and tr.actual_arrival is not null
    and v_today - tr.actual_arrival >= 14
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'DEMURRAGE_RISK' and a.resolved_at is null
    and not exists (
      select 1 from public.transit_records tr
      join public.planned_vehicles pv on pv.id = tr.planned_vehicle_id
      where tr.id = a.subject_id and pv.stage in ('ARRIVED_AT_PORT', 'CUSTOMS_CLEARING')
        and tr.actual_arrival is not null and v_today - tr.actual_arrival >= 14
    );

  -- REGISTRATION_DUE / INSURANCE_DUE: at or past the inspection-and-
  -- registration stage with no *actual* cost recorded yet for that category.
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, visible_to_roles)
  select
    gen_random_uuid(), 'REGISTRATION_DUE', 'NORMAL', 'PLANNED_VEHICLE', pv.id,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.planned_vehicles pv
  where pv.stage in ('INSPECTION_AND_REGISTRATION', 'READY_FOR_ONBOARDING')
    and not exists (
      select 1 from public.acquisition_cost_lines acl
      where acl.planned_vehicle_id = pv.id and acl.cost_category = 'REGISTRATION' and acl.actual_minor is not null
    )
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'REGISTRATION_DUE' and a.resolved_at is null
    and not exists (
      select 1 from public.planned_vehicles pv
      where pv.id = a.subject_id and pv.stage in ('INSPECTION_AND_REGISTRATION', 'READY_FOR_ONBOARDING')
        and not exists (
          select 1 from public.acquisition_cost_lines acl
          where acl.planned_vehicle_id = pv.id and acl.cost_category = 'REGISTRATION' and acl.actual_minor is not null
        )
    );

  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, visible_to_roles)
  select
    gen_random_uuid(), 'INSURANCE_DUE', 'NORMAL', 'PLANNED_VEHICLE', pv.id,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.planned_vehicles pv
  where pv.stage in ('INSPECTION_AND_REGISTRATION', 'READY_FOR_ONBOARDING')
    and not exists (
      select 1 from public.acquisition_cost_lines acl
      where acl.planned_vehicle_id = pv.id and acl.cost_category = 'INSURANCE' and acl.actual_minor is not null
    )
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'INSURANCE_DUE' and a.resolved_at is null
    and not exists (
      select 1 from public.planned_vehicles pv
      where pv.id = a.subject_id and pv.stage in ('INSPECTION_AND_REGISTRATION', 'READY_FOR_ONBOARDING')
        and not exists (
          select 1 from public.acquisition_cost_lines acl
          where acl.planned_vehicle_id = pv.id and acl.cost_category = 'INSURANCE' and acl.actual_minor is not null
        )
    );

  -- MISSING_DOCUMENTS: ready for onboarding with nothing attached at all
  -- (a simplification -- SPEC doesn't enumerate which specific document
  -- types are mandatory, so this checks for zero rather than a checklist).
  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, visible_to_roles)
  select
    gen_random_uuid(), 'MISSING_DOCUMENTS', 'NORMAL', 'PLANNED_VEHICLE', pv.id,
    array['OWNER_ADMIN', 'FLEET_MANAGER']::public.user_role[]
  from public.planned_vehicles pv
  where pv.stage = 'READY_FOR_ONBOARDING'
    and not exists (
      select 1 from public.documents d
      where (d.owner_type = 'PLANNED_VEHICLE' and d.owner_id = pv.id)
         or (d.owner_type = 'TRANSIT_RECORD' and d.owner_id in (
               select tr.id from public.transit_records tr where tr.planned_vehicle_id = pv.id
             ))
    )
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  update public.alerts a
  set resolved_at = pg_catalog.now()
  where a.type = 'MISSING_DOCUMENTS' and a.resolved_at is null
    and not exists (
      select 1 from public.planned_vehicles pv
      where pv.id = a.subject_id and pv.stage = 'READY_FOR_ONBOARDING'
        and not exists (
          select 1 from public.documents d
          where (d.owner_type = 'PLANNED_VEHICLE' and d.owner_id = pv.id)
             or (d.owner_type = 'TRANSIT_RECORD' and d.owner_id in (
                   select tr.id from public.transit_records tr where tr.planned_vehicle_id = pv.id
                 ))
        )
    );
end;
$$;

comment on function app.evaluate_scheduled_alerts() is
  'Daily pg_cron job. Raises MISSED_PAYMENT, MAINTENANCE_DUE, '
  'MAINTENANCE_OVERDUE, VEHICLE_BELOW_TARGET, and (Phase 10) '
  'PURCHASE_DATE_WITHOUT_FUNDS, SAVINGS_BEHIND, DEPOSIT_OR_INSTALLMENT_DUE, '
  'EXPECTED_PORT_ARRIVAL, ARRIVAL_DELAY, CUSTOMS_DEADLINE, DEMURRAGE_RISK, '
  'REGISTRATION_DUE, INSURANCE_DUE, MISSING_DOCUMENTS -- resolving each '
  'once its underlying condition clears. Idempotent.';

-- Re-run once immediately, same as every prior phase's backfill, so the
-- new alert types reflect real data from the moment this migration applies
-- rather than waiting for the next 06:00 run.
select app.evaluate_scheduled_alerts();

-- ---------------------------------------------------------------------------
-- Storage — a private "documents" bucket, first real file upload anywhere
-- in the app. Policies mirror the documents TABLE's own RLS (desktop full
-- access) rather than the mobile grants that table also has: this phase's
-- own need is desktop-only, and building a doc_type-aware mobile storage
-- policy (Maintenance & Repairs problem photos, Collections & Finance
-- receipts) is a pre-existing gap from Phase 5/6, not this phase's to fix.
-- Stated, disclosed limitation -- see decision 0015.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10 * 1024 * 1024)
on conflict (id) do nothing;

create policy documents_bucket_select_desktop on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and app.is_desktop());

create policy documents_bucket_insert_desktop on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and app.is_desktop());
