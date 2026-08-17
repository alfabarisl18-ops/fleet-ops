-- Fleet Operations SL — Rent-to-own redesign (SPEC open question 2, answered)
--
-- Confirmed with the user: once a driver-purchase agreement is set up, the
-- vehicle's daily payment target BECOMES the installment -- the collector's
-- ordinary "what happened today" entry is how the installment gets
-- collected, there is no second flow. While an agreement is active, EVERY
-- shortfall becomes driver debt (Full Day, Half Day, Breakdown, all of
-- them) -- the accepted-loss exception is suspended for that vehicle.
-- Weekly/Monthly installments divide evenly into a daily figure. On
-- payoff, the vehicle retires (archived).
--
-- This extends shortfall_treatment (decision 0003's GENERATED ALWAYS
-- column, deliberately built so no code path can ever set it directly) to
-- depend on one more same-row fact, preserving that guarantee exactly --
-- see the column's own comment below for the full reasoning.

-- ---------------------------------------------------------------------------
-- 1. daily_payment_records: one new snapshot column, same philosophy as
--    the existing expected_amount_minor snapshot -- what mattered is what
--    was true that day, not what's true when someone looks later.
-- ---------------------------------------------------------------------------

alter table public.daily_payment_records
  add column under_active_agreement boolean not null default false;

comment on column public.daily_payment_records.under_active_agreement is
  'Snapshotted by app.daily_payment_before_insert() at insert time: did '
  'this vehicle have a non-cancelled driver-purchase agreement that day? '
  'Feeds shortfall_treatment''s generated expression below -- see that '
  'column''s comment.';

create or replace function app.daily_payment_before_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  vehicle_target bigint;
  vehicle_driver uuid;
begin
  select v.expected_daily_amount_minor, v.current_driver_id
    into vehicle_target, vehicle_driver
  from public.vehicles v
  where v.id = new.vehicle_id;

  if new.expected_amount_minor is null or not app.is_desktop() then
    new.expected_amount_minor := coalesce(vehicle_target, 0);
  end if;

  if new.driver_id is null then
    new.driver_id := vehicle_driver;
  end if;

  new.under_active_agreement := exists (
    select 1 from public.driver_purchase_agreements
    where vehicle_id = new.vehicle_id and ownership_transfer_status <> 'CANCELLED'
  );

  new.entered_at := pg_catalog.now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. shortfall_treatment grows one more input. Changing a generated
--    column's expression requires dropping and re-adding it (decision
--    0003 flagged this cost explicitly) -- the dependent partial index
--    has to come off first and back on after.
-- ---------------------------------------------------------------------------

drop index public.daily_payment_records_debt_idx;

alter table public.daily_payment_records drop column shortfall_treatment;

alter table public.daily_payment_records add column shortfall_treatment public.shortfall_treatment
  generated always as (
    case
      when received_amount_minor >= expected_amount_minor then null
      when under_active_agreement then 'DRIVER_DEBT'::public.shortfall_treatment
      when day_outcome = 'FULL_DAY' then 'DRIVER_DEBT'::public.shortfall_treatment
      else 'ACCEPTED_LOSS'::public.shortfall_treatment
    end
  ) stored;

create index daily_payment_records_debt_idx
  on public.daily_payment_records (driver_id, service_date desc)
  where shortfall_treatment = 'DRIVER_DEBT';

comment on column public.daily_payment_records.shortfall_treatment is
  'Derived from day_outcome, UNLESS under_active_agreement is true, in '
  'which case any shortfall is DRIVER_DEBT regardless of day_outcome -- a '
  'driver paying an installment is responsible for the full amount every '
  'day, not just on a Full Day. Generated, so it can never be selected by '
  'the person entering the record, and every historical row (all recorded '
  'before this existed, so under_active_agreement defaults false for all '
  'of them) recomputes to exactly the value it already had.';

-- ---------------------------------------------------------------------------
-- 3. driver_purchase_agreements: completion and cancellation are new --
--    the table only ever supported create before this. Both need an
--    audit trail (who, when, and — for cancellation — why), same shape
--    as every other reviewed-decision column pair in this codebase.
-- ---------------------------------------------------------------------------

alter table public.driver_purchase_agreements
  add column completed_by        uuid references public.users (id),
  add column completed_at        timestamptz,
  add column cancelled_by        uuid references public.users (id),
  add column cancelled_at        timestamptz,
  add column cancellation_reason text;

alter table public.driver_purchase_agreements add constraint dpa_completed_pair
  check (num_nonnulls(completed_by, completed_at) in (0, 2));
alter table public.driver_purchase_agreements add constraint dpa_cancelled_triple
  check (num_nonnulls(cancelled_by, cancelled_at, cancellation_reason) in (0, 3));
alter table public.driver_purchase_agreements add constraint dpa_status_matches_completion
  check ((ownership_transfer_status = 'COMPLETED') = (completed_at is not null));
alter table public.driver_purchase_agreements add constraint dpa_status_matches_cancellation
  check ((ownership_transfer_status = 'CANCELLED') = (cancelled_at is not null));

-- ---------------------------------------------------------------------------
-- set_up_driver_purchase_agreement -- SECURITY INVOKER: desktop already
-- has the grants both writes need (dpa_insert_desktop, and the same
-- vehicles UPDATE grant updateVehicleTarget already uses for
-- yearly_target_minor), no privilege gap to bridge. Replaces the plain
-- insert createAgreement used to do -- now the agreement and the vehicle's
-- new daily target are set in one transaction, not two client calls that
-- could partially fail.
-- ---------------------------------------------------------------------------

create or replace function public.set_up_driver_purchase_agreement(
  p_client_record_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_agreement_amount_minor bigint,
  p_regular_payment_minor bigint,
  p_payment_frequency public.payment_frequency,
  p_started_on date,
  p_expected_completion_on date
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_id uuid;
  v_daily_amount bigint;
begin
  insert into public.driver_purchase_agreements
    (client_record_id, vehicle_id, driver_id, agreement_amount_minor, regular_payment_minor,
     payment_frequency, started_on, expected_completion_on)
  values
    (p_client_record_id, p_vehicle_id, p_driver_id, p_agreement_amount_minor, p_regular_payment_minor,
     p_payment_frequency, p_started_on, p_expected_completion_on)
  returning id into v_id;

  -- Weekly / 7, Monthly / days in that calendar month -- a stated rounding
  -- choice (integer division), not exact to the leone over a period.
  v_daily_amount := case p_payment_frequency
    when 'DAILY' then p_regular_payment_minor
    when 'WEEKLY' then p_regular_payment_minor / 7
    when 'MONTHLY' then p_regular_payment_minor
      / extract(day from (date_trunc('month', p_started_on::timestamp) + interval '1 month' - interval '1 day'))::integer
  end;

  update public.vehicles set expected_daily_amount_minor = v_daily_amount where id = p_vehicle_id;

  return v_id;
end;
$$;

comment on function public.set_up_driver_purchase_agreement(uuid, uuid, uuid, bigint, bigint, public.payment_frequency, date, date) is
  'Creates a driver-purchase agreement and sets the vehicle''s daily '
  'target to the installment''s daily-equivalent, in one transaction. '
  'SECURITY INVOKER -- desktop already has the grants this needs.';

revoke all on function public.set_up_driver_purchase_agreement(uuid, uuid, uuid, bigint, bigint, public.payment_frequency, date, date) from public, anon;
grant execute on function public.set_up_driver_purchase_agreement(uuid, uuid, uuid, bigint, bigint, public.payment_frequency, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_driver_purchase_agreement -- SECURITY INVOKER: either desktop
-- role, matching dpa_update_desktop's existing scope. Archiving goes
-- through vehicle_status_events, never a direct vehicles write (decision
-- 0006) -- the exact mechanism changeVehicleStatus already uses.
-- Deliberately manual, not automatic payoff-detection: nothing in this
-- codebase links a daily payment back to the agreement it's an
-- installment on closely enough to trust an automatic "fully paid"
-- trigger, and getting that wrong would archive a vehicle that still
-- owes money. The vehicle profile shows a running paid/remaining figure
-- instead, so a person decides.
-- ---------------------------------------------------------------------------

create or replace function public.complete_driver_purchase_agreement(p_agreement_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_caller uuid := app.current_user_id();
  v_vehicle_id uuid;
  v_status public.ownership_transfer_status;
begin
  select vehicle_id, ownership_transfer_status into v_vehicle_id, v_status
  from public.driver_purchase_agreements
  where id = p_agreement_id;

  if not found then
    raise exception 'Agreement not found' using errcode = 'no_data_found';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'This agreement is already completed' using errcode = 'check_violation';
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'A cancelled agreement cannot be completed' using errcode = 'check_violation';
  end if;

  update public.driver_purchase_agreements
  set ownership_transfer_status = 'COMPLETED',
      completed_by = v_caller,
      completed_at = pg_catalog.now()
  where id = p_agreement_id;

  insert into public.vehicle_status_events (client_record_id, vehicle_id, to_status, changed_by, reason)
  values (gen_random_uuid(), v_vehicle_id, 'ARCHIVED', v_caller,
          'Driver-purchase agreement completed — ownership transferred to the driver');
end;
$$;

comment on function public.complete_driver_purchase_agreement(uuid) is
  'Marks a driver-purchase agreement paid off and archives the vehicle. '
  'Manual, not automatic -- SECURITY INVOKER, either desktop role, same '
  'scope as dpa_update_desktop.';

revoke all on function public.complete_driver_purchase_agreement(uuid) from public, anon;
grant execute on function public.complete_driver_purchase_agreement(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_driver_purchase_agreement -- same SECURITY INVOKER reasoning,
-- reason required, same shape as override_shortfall_treatment's existing
-- "a desktop role changes a shortfall's fate with a required reason".
-- Deliberately does NOT restore the vehicle's previous daily target --
-- the new updateExpectedDailyAmount edit path (src/data/vehicles.ts) is
-- what a person uses to correct it afterward.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_driver_purchase_agreement(p_agreement_id uuid, p_reason text)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_status public.ownership_transfer_status;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to cancel an agreement' using errcode = 'check_violation';
  end if;

  select ownership_transfer_status into v_status
  from public.driver_purchase_agreements
  where id = p_agreement_id;

  if not found then
    raise exception 'Agreement not found' using errcode = 'no_data_found';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'A completed agreement cannot be cancelled' using errcode = 'check_violation';
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'This agreement is already cancelled' using errcode = 'check_violation';
  end if;

  update public.driver_purchase_agreements
  set ownership_transfer_status = 'CANCELLED',
      cancelled_by = app.current_user_id(),
      cancelled_at = pg_catalog.now(),
      cancellation_reason = btrim(p_reason)
  where id = p_agreement_id;
end;
$$;

comment on function public.cancel_driver_purchase_agreement(uuid, text) is
  'Cancels a driver-purchase agreement. Reason required. Does not touch '
  'the vehicle''s daily target -- see updateExpectedDailyAmount.';

revoke all on function public.cancel_driver_purchase_agreement(uuid, text) from public, anon;
grant execute on function public.cancel_driver_purchase_agreement(uuid, text) to authenticated;
