-- Fleet Operations SL — Phase 5 (Daily payments, Sprinter-only)
--
-- Phase 1 built daily_payment_records / bundled_payments /
-- outstanding_balances / balance_settlements / driver_credits with schema,
-- generated columns (shortfall_amount_minor, shortfall_treatment,
-- covers_to_date), RLS, and grants already in place. Nothing has ever
-- written to them. This migration is the recording workflow.
--
-- Scope, per the approved plan: Sprinter-only (every vehicle type except
-- BOX_TRUCK, which is trip-based, not day_outcome-based -- deferred, not
-- built here). No debt forgiveness / write-off workflow (SPEC lists it as
-- an explicitly open question). See docs/decisions/0010 for the full
-- reasoning, including the bundle-distribution assumption and the
-- overpayment cascade design.

-- ---------------------------------------------------------------------------
-- Fix a real bug in app.enforce_append_only() (20260808232229_identity.sql),
-- found by testing, not assumed: daily_payment_records is the first table
-- with both a GENERATED STORED column and a partial mutable-columns
-- allow-list. Postgres recomputes GENERATED columns *after* BEFORE
-- triggers run, so inside this BEFORE UPDATE trigger, NEW's generated
-- value doesn't yet reflect what it will actually be -- comparing it
-- against OLD's already-materialized value produces a false "changed"
-- positive on every single update, even to an explicitly allow-listed
-- column (ledger_entry_id). Generated columns can never be directly set by
-- a client anyway (Postgres itself blocks that at INSERT), so excluding
-- them from this comparison loses no real protection.
-- ---------------------------------------------------------------------------

create or replace function app.enforce_append_only()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  mutable_columns text[] := coalesce(tg_argv, array[]::text[]);
  changed_column  text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Rows in % are append-only and cannot be deleted', tg_table_name
      using errcode = 'restrict_violation',
            hint = 'Write a correction row that supersedes this one.';
  end if;

  select o.key into changed_column
  from pg_catalog.jsonb_each(pg_catalog.to_jsonb(old)) o(key, value)
  where o.value is distinct from (pg_catalog.to_jsonb(new) -> o.key)
    and not (o.key = any(mutable_columns))
    and not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = tg_relid and a.attname = o.key and a.attgenerated <> ''
    )
  limit 1;

  if changed_column is not null then
    raise exception 'Column %.% is append-only and cannot be updated',
      tg_table_name, changed_column
      using errcode = 'restrict_violation',
            hint = 'Write a correction row that supersedes this one.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.apply_daily_payment_effects — shared by both entry points below, so
-- "what happens after a daily_payment_records row exists" lives in one
-- place regardless of whether it came from a single-day or bundled entry.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: found by testing against a real Collections & Finance
-- submission, not assumed. dpr_update_desktop only lets desktop roles
-- UPDATE daily_payment_records -- Collections & Finance can INSERT the row
-- but the ledger_entry_id link-back at the end of this function silently
-- affected zero rows for that role (RLS filtering, not an error), leaving
-- the column null even though the ledger_entries row itself was created
-- correctly. The row was already authorized at INSERT time; this just
-- finishes bookkeeping the inserting role is entitled to have happen, the
-- same reasoning vehicle_status_event_after() already uses.
create or replace function app.apply_daily_payment_effects(p_daily_payment_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_dpr public.daily_payment_records%rowtype;
  v_ledger_entry_id uuid;
  v_received_at date;
  v_category public.ledger_category;
begin
  select * into v_dpr from public.daily_payment_records where id = p_daily_payment_id;

  if v_dpr.shortfall_treatment = 'DRIVER_DEBT' then
    if v_dpr.driver_id is null then
      raise exception 'Cannot record a shortfall as driver debt: no driver is assigned to this vehicle'
        using errcode = 'check_violation';
    end if;

    insert into public.outstanding_balances
      (client_record_id, driver_id, vehicle_id, origin_daily_payment_id,
       original_amount_minor, remaining_amount_minor)
    values
      (gen_random_uuid(), v_dpr.driver_id, v_dpr.vehicle_id, v_dpr.id,
       v_dpr.shortfall_amount_minor, v_dpr.shortfall_amount_minor);
  end if;

  if v_dpr.received_amount_minor > 0 then
    -- A bundled day's money arrived when the bundle was entered, not
    -- "today" -- that date lives on bundled_payments, not this row.
    if v_dpr.bundled_payment_id is not null then
      select received_at into v_received_at from public.bundled_payments where id = v_dpr.bundled_payment_id;
    else
      v_received_at := app.freetown_today();
    end if;

    -- Re-categorize as a driver-purchase installment when this vehicle has
    -- an open driver-purchase agreement -- the exact deferral named when
    -- Phase 3 built driver_purchase_agreements ("this phase only creates
    -- and displays the agreement record... the re-categorization... is
    -- Phase 5's job"). "Open" matches fetchOpenAgreementForVehicle's own
    -- definition: any status except CANCELLED.
    if exists (
      select 1 from public.driver_purchase_agreements
      where vehicle_id = v_dpr.vehicle_id and ownership_transfer_status <> 'CANCELLED'
    ) then
      v_category := 'DRIVER_PURCHASE_INSTALLMENT';
    else
      v_category := 'DAILY_VEHICLE_PAYMENT';
    end if;

    insert into public.ledger_entries
      (client_record_id, direction, amount_minor, category, applies_to_date, received_at,
       entered_by_user_id, vehicle_id, driver_id, source_type, source_id)
    values
      (gen_random_uuid(), 'INCOME', v_dpr.received_amount_minor, v_category,
       v_dpr.service_date, v_received_at, app.current_user_id(), v_dpr.vehicle_id, v_dpr.driver_id,
       'DAILY_PAYMENT_RECORD', v_dpr.id)
    returning id into v_ledger_entry_id;

    update public.daily_payment_records set ledger_entry_id = v_ledger_entry_id where id = p_daily_payment_id;
  end if;
end;
$$;

comment on function app.apply_daily_payment_effects(uuid) is
  'Shared side effects for a daily_payment_records row that already '
  'exists: the outstanding_balances row for a DRIVER_DEBT shortfall, and '
  'the ledger_entries row for any money received, correctly categorized '
  'as a driver-purchase installment when one is open on the vehicle.';

-- ---------------------------------------------------------------------------
-- public.record_daily_payment — single day, standalone.
-- ---------------------------------------------------------------------------

create or replace function public.record_daily_payment(
  p_client_record_id uuid,
  p_vehicle_id uuid,
  p_service_date date,
  p_day_outcome public.day_outcome,
  p_received_amount_minor bigint,
  p_shortfall_cause public.shortfall_cause default null,
  p_shortfall_note text default null,
  p_overpayment_reason public.overpayment_reason default null
)
  returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  v_id uuid;
  v_expected bigint;
  v_driver_id uuid;
  v_overpaid bigint;
  v_remaining_overpaid bigint;
  v_balance record;
  v_applied bigint;
  v_ledger_entry_id uuid;
begin
  insert into public.daily_payment_records
    (client_record_id, vehicle_id, service_date, day_outcome, received_amount_minor,
     shortfall_cause, shortfall_note, overpayment_reason, entered_by)
  values
    (p_client_record_id, p_vehicle_id, p_service_date, p_day_outcome, p_received_amount_minor,
     p_shortfall_cause, p_shortfall_note, p_overpayment_reason, app.current_user_id())
  returning id, expected_amount_minor, driver_id into v_id, v_expected, v_driver_id;

  perform app.apply_daily_payment_effects(v_id);

  if p_received_amount_minor > v_expected then
    v_overpaid := p_received_amount_minor - v_expected;

    if p_overpayment_reason is null then
      raise exception 'Overpayment requires a reason' using errcode = 'check_violation';
    end if;

    if p_overpayment_reason = 'SETTLING_BALANCE' then
      if v_driver_id is null then
        raise exception 'Cannot settle a balance: no driver is assigned to this vehicle'
          using errcode = 'check_violation';
      end if;

      select ledger_entry_id into v_ledger_entry_id from public.daily_payment_records where id = v_id;
      v_remaining_overpaid := v_overpaid;

      for v_balance in
        select id, remaining_amount_minor from public.outstanding_balances
        where driver_id = v_driver_id and status in ('OPEN', 'PARTIAL')
        order by created_at asc
        for update
      loop
        exit when v_remaining_overpaid <= 0;

        v_applied := least(v_remaining_overpaid, v_balance.remaining_amount_minor);

        insert into public.balance_settlements
          (client_record_id, balance_id, ledger_entry_id, amount_minor, entered_by)
        values
          (gen_random_uuid(), v_balance.id, v_ledger_entry_id, v_applied, app.current_user_id());

        update public.outstanding_balances
        set remaining_amount_minor = remaining_amount_minor - v_applied,
            status = case when remaining_amount_minor - v_applied = 0 then 'CLEARED'::public.balance_status else 'PARTIAL'::public.balance_status end,
            closed_at = case when remaining_amount_minor - v_applied = 0 then pg_catalog.now() else null end
        where id = v_balance.id;

        v_remaining_overpaid := v_remaining_overpaid - v_applied;
      end loop;
    elsif p_overpayment_reason = 'ADVANCE' then
      if v_driver_id is null then
        raise exception 'Cannot record an advance: no driver is assigned to this vehicle'
          using errcode = 'check_violation';
      end if;

      insert into public.driver_credits
        (client_record_id, driver_id, amount_minor, remaining_minor, created_from_payment_id)
      values
        (gen_random_uuid(), v_driver_id, v_overpaid, v_overpaid, v_id);
    end if;
    -- OTHER: no side effect beyond the required note, already enforced by
    -- dpr_other_overpayment_requires_note.
  end if;

  return v_id;
end;
$$;

comment on function public.record_daily_payment(uuid, uuid, date, public.day_outcome, bigint, public.shortfall_cause, text, public.overpayment_reason) is
  'Records one vehicle-day payment and its consequences atomically: the '
  'daily_payment_records row, the DRIVER_DEBT/ledger side effects via '
  'app.apply_daily_payment_effects, and -- only here, not in the bundled '
  'path -- overpayment routing (settle the driver''s oldest open balances '
  'first, or hold the excess as a credit). RLS on the underlying tables is '
  'the real authorization; this is SECURITY INVOKER, not DEFINER.';

revoke all on function public.record_daily_payment(uuid, uuid, date, public.day_outcome, bigint, public.shortfall_cause, text, public.overpayment_reason) from public, anon;
grant execute on function public.record_daily_payment(uuid, uuid, date, public.day_outcome, bigint, public.shortfall_cause, text, public.overpayment_reason) to authenticated;

-- ---------------------------------------------------------------------------
-- public.record_bundled_payment — several days at once.
--
-- Assumption, stated because it affects money: a bundle is "N regular full
-- days, paid together" -- not a day-by-day outcome picker. Overpayment
-- within a bundle isn't handled: SPEC describes overpayment in the context
-- of entering one payment, not a multi-day catch-up.
-- ---------------------------------------------------------------------------

create or replace function public.record_bundled_payment(
  p_client_record_id uuid,
  p_vehicle_id uuid,
  p_covers_from_date date,
  p_days_covered integer,
  p_total_amount_minor bigint,
  p_received_at date default null,
  p_note text default null
)
  returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  v_bundle_id uuid;
  v_dpr_id uuid;
  v_day_amount bigint;
  v_remainder bigint;
  v_driver_id uuid;
  i integer;
begin
  if p_days_covered < 1 then
    raise exception 'days_covered must be at least 1' using errcode = 'check_violation';
  end if;

  select current_driver_id into v_driver_id from public.vehicles where id = p_vehicle_id;

  insert into public.bundled_payments
    (client_record_id, vehicle_id, driver_id, total_amount_minor, received_at,
     covers_from_date, days_covered, note, entered_by)
  values
    (p_client_record_id, p_vehicle_id, v_driver_id, p_total_amount_minor,
     coalesce(p_received_at, app.freetown_today()), p_covers_from_date, p_days_covered,
     p_note, app.current_user_id())
  returning id into v_bundle_id;

  v_day_amount := p_total_amount_minor / p_days_covered;
  v_remainder := p_total_amount_minor - (v_day_amount * p_days_covered);

  for i in 0 .. p_days_covered - 1 loop
    insert into public.daily_payment_records
      (client_record_id, vehicle_id, service_date, day_outcome, received_amount_minor,
       bundled_payment_id, entered_by)
    values
      (gen_random_uuid(), p_vehicle_id, p_covers_from_date + i, 'FULL_DAY',
       v_day_amount + case when i = p_days_covered - 1 then v_remainder else 0 end,
       v_bundle_id, app.current_user_id())
    returning id into v_dpr_id;

    perform app.apply_daily_payment_effects(v_dpr_id);
  end loop;

  return v_bundle_id;
end;
$$;

comment on function public.record_bundled_payment(uuid, uuid, date, integer, bigint, date, text) is
  'Records several consecutive days as one lump-sum catch-up payment -- '
  'one bundled_payments row plus days_covered daily_payment_records rows, '
  'each FULL_DAY at an even split of the total (remainder cents on the '
  'last day), each running the same shared side effects as a standalone '
  'day. SECURITY INVOKER, same reasoning as record_daily_payment.';

revoke all on function public.record_bundled_payment(uuid, uuid, date, integer, bigint, date, text) from public, anon;
grant execute on function public.record_bundled_payment(uuid, uuid, date, integer, bigint, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- public.override_shortfall_treatment — desktop review action.
-- ---------------------------------------------------------------------------

create or replace function public.override_shortfall_treatment(p_daily_payment_id uuid, p_reason text)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  v_dpr public.daily_payment_records%rowtype;
  v_owner uuid := app.current_user_id();
begin
  if not coalesce(app.is_desktop(), false) then
    raise exception 'Only Owner/Admin or Fleet Manager may review a shortfall'
      using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;

  select * into v_dpr from public.daily_payment_records where id = p_daily_payment_id for update;
  if not found then
    raise exception 'Daily payment record not found' using errcode = 'no_data_found';
  end if;

  if v_dpr.shortfall_treatment <> 'ACCEPTED_LOSS' then
    raise exception 'Only an accepted shortfall can be converted to driver debt'
      using errcode = 'check_violation';
  end if;

  if v_dpr.shortfall_treatment_override is not null then
    raise exception 'This shortfall has already been reviewed' using errcode = 'unique_violation';
  end if;

  if v_dpr.driver_id is null then
    raise exception 'Cannot convert to driver debt: no driver is assigned to this vehicle'
      using errcode = 'check_violation';
  end if;

  update public.daily_payment_records
  set shortfall_treatment_override = 'DRIVER_DEBT',
      shortfall_treatment_override_by = v_owner,
      shortfall_treatment_override_at = pg_catalog.now(),
      shortfall_treatment_override_reason = p_reason
  where id = p_daily_payment_id;

  insert into public.outstanding_balances
    (client_record_id, driver_id, vehicle_id, origin_daily_payment_id,
     original_amount_minor, remaining_amount_minor)
  values
    (gen_random_uuid(), v_dpr.driver_id, v_dpr.vehicle_id, v_dpr.id,
     v_dpr.shortfall_amount_minor, v_dpr.shortfall_amount_minor);

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'SHORTFALL_OVERRIDDEN_TO_DEBT', 'DAILY_PAYMENT_RECORD', v_dpr.id,
     v_dpr.vehicle_id, v_dpr.driver_id, app.freetown_today(), v_owner,
     format('Shortfall on %s converted to driver debt: %s', v_dpr.service_date, p_reason));
end;
$$;

comment on function public.override_shortfall_treatment(uuid, text) is
  'Converts an ACCEPTED_LOSS shortfall to DRIVER_DEBT on review -- SPEC: '
  '"Owner/Admin or Fleet Manager can convert it to driver debt on review." '
  'Owner/Admin or Fleet Manager only, enforced inside the function body. '
  'Creates the outstanding_balances row the original insert did not.';

revoke all on function public.override_shortfall_treatment(uuid, text) from public, anon;
grant execute on function public.override_shortfall_treatment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Records-spine integration -- extends Phase 4's pattern.
-- ---------------------------------------------------------------------------

create or replace function app.activity_after_daily_payment_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
  v_outcome_label text;
  v_cause_label text;
  v_summary text;
begin
  select fleet_id into v_fleet_id from public.vehicles where id = new.vehicle_id;

  v_outcome_label := case new.day_outcome
    when 'FULL_DAY' then 'Full Day'
    when 'HALF_DAY' then 'Half Day'
    when 'DRIVERS_DAY' then 'Driver''s Day'
    when 'BREAKDOWN' then 'Breakdown'
    when 'DID_NOT_WORK' then 'Did Not Work'
    else new.day_outcome::text
  end;

  v_summary := format('%s — %s', coalesce(v_fleet_id, '(unknown)'), v_outcome_label);

  if new.day_outcome = 'HALF_DAY' and new.shortfall_cause is not null then
    v_cause_label := case new.shortfall_cause
      when 'BREAKDOWN' then 'breakdown'
      when 'ACCIDENT' then 'accident'
      when 'POLICE_CHECKPOINT' then 'police/checkpoint'
      when 'OTHER' then 'other'
      else new.shortfall_cause::text
    end;
    v_summary := v_summary || format(' (%s)', v_cause_label);
  end if;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id,
     amount_minor, direction, applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'DAILY_PAYMENT_RECORDED', 'DAILY_PAYMENT_RECORD', new.id, new.vehicle_id, new.driver_id,
     case when new.received_amount_minor > 0 then new.received_amount_minor end,
     case when new.received_amount_minor > 0 then 'INCOME'::public.ledger_direction end,
     new.service_date, new.entered_by, v_summary);
  return null;
end;
$$;

create trigger daily_payment_records_activity_after_insert
  after insert on public.daily_payment_records
  for each row execute function app.activity_after_daily_payment_insert();

create or replace function app.activity_after_bundled_payment_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
begin
  select fleet_id into v_fleet_id from public.vehicles where id = new.vehicle_id;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'BUNDLED_PAYMENT_RECORDED', 'BUNDLED_PAYMENT', new.id, new.vehicle_id, new.driver_id,
     new.received_at, new.entered_by,
     format('%s day(s) paid together for %s (%s to %s)',
       new.days_covered, coalesce(v_fleet_id, '(unknown)'), new.covers_from_date, new.covers_to_date));
  return null;
end;
$$;

create trigger bundled_payments_activity_after_insert
  after insert on public.bundled_payments
  for each row execute function app.activity_after_bundled_payment_insert();

-- Only for entries with no source_type -- i.e. "Other Payment," which has
-- no daily_payment_records row to already represent it. A payment-flow
-- ledger entry (source_type = 'DAILY_PAYMENT_RECORD') is already covered
-- by the trigger above; this avoids a double entry for the same event.
create or replace function app.activity_after_other_ledger_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.source_type is not null then
    return null;
  end if;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id,
     amount_minor, direction, applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'OTHER_PAYMENT_RECORDED', 'LEDGER_ENTRY', new.id, new.vehicle_id, new.driver_id,
     new.amount_minor, new.direction, new.applies_to_date, new.entered_by_user_id,
     coalesce(nullif(btrim(coalesce(new.note, '')), ''), initcap(replace(new.category::text, '_', ' '))));
  return null;
end;
$$;

create trigger ledger_entries_activity_after_insert
  after insert on public.ledger_entries
  for each row execute function app.activity_after_other_ledger_insert();
