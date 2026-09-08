-- Forward-only installment policy. No historical money row is updated.
alter table public.driver_purchase_agreements
  add column schedule_effective_on date,
  add column schedule_daily_amount_minor bigint,
  add column schedule_baseline_on date,
  add column schedule_closed_progress jsonb;
create or replace function app.agreement_daily_amount(p_amount bigint, p_frequency public.payment_frequency, p_start date)
returns bigint language sql immutable set search_path = '' as $$
 select case p_frequency when 'DAILY' then p_amount when 'WEEKLY' then p_amount / 7
 else p_amount / extract(day from (date_trunc('month',p_start::timestamp)+interval '1 month - 1 day'))::bigint end;
$$;

-- Existing closed agreements remain on their original terms. Existing open ones
-- begin the new schedule today, without extending for pre-policy missed days.
update public.driver_purchase_agreements a
set schedule_effective_on = greatest(a.started_on,app.freetown_today()),
    schedule_daily_amount_minor = app.agreement_daily_amount(a.regular_payment_minor,a.payment_frequency,a.started_on)
where a.ownership_transfer_status in ('NOT_STARTED','IN_PROGRESS');
update public.driver_purchase_agreements a
set schedule_baseline_on = coalesce(a.expected_completion_on,
  greatest(a.started_on,app.freetown_today()) +
  greatest(0, ((greatest(a.agreement_amount_minor-coalesce((
    select sum(l.amount_minor) from public.ledger_entries l
    where l.vehicle_id=a.vehicle_id and l.category='DRIVER_PURCHASE_INSTALLMENT'
      and l.applies_to_date>=a.started_on and l.superseded_by_id is null
  ),0),0)+a.schedule_daily_amount_minor-1)/nullif(a.schedule_daily_amount_minor,0))::integer-1))
where a.schedule_effective_on is not null;

alter table public.driver_purchase_agreements add constraint dpa_schedule_complete check (
 (schedule_effective_on is null and schedule_daily_amount_minor is null and schedule_baseline_on is null)
 or (schedule_effective_on is not null and schedule_daily_amount_minor is not null and schedule_daily_amount_minor > 0 and schedule_baseline_on is not null)
);
alter table public.daily_payment_records
  add column purchase_agreement_id uuid references public.driver_purchase_agreements(id),
  add column defer_installment boolean not null default false;
alter table public.ledger_entries
  add column purchase_agreement_id uuid references public.driver_purchase_agreements(id),
  add column purchase_applied_minor bigint not null default 0 check (purchase_applied_minor>=0 and purchase_applied_minor<=amount_minor);
create index ledger_purchase_agreement_idx on public.ledger_entries(purchase_agreement_id) where purchase_agreement_id is not null;
create index daily_payment_agreement_idx on public.daily_payment_records(purchase_agreement_id,service_date) where purchase_agreement_id is not null;

-- Keep old snapshots unchanged when rebuilding the generated column.
drop index public.daily_payment_records_debt_idx;
alter table public.daily_payment_records drop column shortfall_treatment;
alter table public.daily_payment_records add column shortfall_treatment public.shortfall_treatment
 generated always as (case
   when received_amount_minor>=expected_amount_minor then null
   when defer_installment then 'DEFERRED_INSTALLMENT'::public.shortfall_treatment
   when under_active_agreement or day_outcome='FULL_DAY' then 'DRIVER_DEBT'::public.shortfall_treatment
   else 'ACCEPTED_LOSS'::public.shortfall_treatment end) stored;
create index daily_payment_records_debt_idx on public.daily_payment_records(driver_id,service_date desc)
 where shortfall_treatment='DRIVER_DEBT';

create or replace function app.agreement_for_day(p_vehicle_id uuid,p_date date)
returns uuid language sql stable security definer set search_path = '' as $$
 select a.id from public.driver_purchase_agreements a
 where a.vehicle_id=p_vehicle_id and a.started_on<=p_date
   and (a.cancelled_at is null or p_date<=(a.cancelled_at at time zone 'Africa/Freetown')::date)
   and (a.completed_at is null or p_date<=(a.completed_at at time zone 'Africa/Freetown')::date)
 order by a.started_on desc,a.created_at desc limit 1;
$$;
revoke all on function app.agreement_for_day(uuid,date) from public,anon,authenticated;

create or replace function app.daily_payment_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_target bigint; v_driver uuid; a public.driver_purchase_agreements%rowtype;
begin
 select expected_daily_amount_minor,current_driver_id into v_target,v_driver from public.vehicles where id=new.vehicle_id;
 new.purchase_agreement_id:=app.agreement_for_day(new.vehicle_id,new.service_date);
 select * into a from public.driver_purchase_agreements where id=new.purchase_agreement_id;
 new.under_active_agreement:=a.id is not null;
 new.defer_installment:=coalesce(a.schedule_effective_on<=new.service_date,false);
 if new.defer_installment then
   new.expected_amount_minor:=a.schedule_daily_amount_minor;
   new.driver_id:=a.driver_id;
 elsif new.expected_amount_minor is null or not coalesce(app.is_desktop(),false) then
   new.expected_amount_minor:=coalesce(v_target,0);
 end if;
 if new.driver_id is null then new.driver_id:=coalesce(a.driver_id,v_driver); end if;
 if new.overpayment_reason='PURCHASE_PAYMENT' and not new.defer_installment then
   raise exception 'Extra purchase payments require an agreement using the new schedule' using errcode='check_violation';
 end if;
 new.entered_at:=pg_catalog.now();
 return new;
end; $$;

-- Tag ledger money at the trusted boundary, including replacement/correction rows.
create or replace function app.purchase_ledger_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d public.daily_payment_records%rowtype;
begin
 new.purchase_agreement_id:=null;
 new.purchase_applied_minor:=0;
 if new.source_type='DAILY_PAYMENT_RECORD' and new.source_id is not null then
   select * into d from public.daily_payment_records where id=new.source_id;
   if d.purchase_agreement_id is not null then
     new.purchase_agreement_id:=d.purchase_agreement_id;
     if new.direction='INCOME' then
       new.purchase_applied_minor:=case
         when not d.defer_installment or d.overpayment_reason='PURCHASE_PAYMENT' then new.amount_minor
         else least(new.amount_minor,d.expected_amount_minor) end;
     end if;
   end if;
 end if;
 return new;
end; $$;
create trigger ledger_purchase_before_insert before insert on public.ledger_entries
 for each row execute function app.purchase_ledger_before_insert();

create or replace function app.agreement_schedule_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.schedule_closed_progress:=null;
 new.schedule_effective_on:=greatest(new.started_on,app.freetown_today());
 new.schedule_daily_amount_minor:=app.agreement_daily_amount(new.regular_payment_minor,new.payment_frequency,new.started_on);
 if coalesce(new.schedule_daily_amount_minor,0)<=0 then
   raise exception 'The agreement installment must provide at least one minor unit per day' using errcode='check_violation';
 end if;
 new.schedule_baseline_on:=coalesce(new.expected_completion_on,new.schedule_effective_on+
   ((new.agreement_amount_minor+new.schedule_daily_amount_minor-1)/new.schedule_daily_amount_minor)::integer-1);
 return new;
end; $$;
create trigger dpa_schedule_before_insert before insert on public.driver_purchase_agreements
 for each row execute function app.agreement_schedule_before_insert();

-- Terms and baseline cannot drift while collecting. Complete/cancel columns remain writable.
create or replace function app.agreement_schedule_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.schedule_closed_progress is distinct from old.schedule_closed_progress
 or new.schedule_effective_on is distinct from old.schedule_effective_on
 or new.schedule_daily_amount_minor is distinct from old.schedule_daily_amount_minor
 or new.schedule_baseline_on is distinct from old.schedule_baseline_on
 or new.agreement_amount_minor is distinct from old.agreement_amount_minor
 or new.regular_payment_minor is distinct from old.regular_payment_minor
 or new.payment_frequency is distinct from old.payment_frequency
 or new.started_on is distinct from old.started_on
 or new.expected_completion_on is distinct from old.expected_completion_on
 or new.vehicle_id is distinct from old.vehicle_id or new.driver_id is distinct from old.driver_id then
   raise exception 'Agreement terms are fixed; cancel and create a new agreement to change terms' using errcode='check_violation';
 end if;
 if old.ownership_transfer_status in ('NOT_STARTED','IN_PROGRESS') and new.ownership_transfer_status in ('CANCELLED','COMPLETED') then
   new.schedule_closed_progress:=public.driver_purchase_progress(old.id);
 end if;
 return new;
end; $$;
create trigger dpa_schedule_before_update before update on public.driver_purchase_agreements
 for each row execute function app.agreement_schedule_before_update();

create or replace function public.vehicle_purchase_payment_context(p_vehicle_id uuid,p_service_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.driver_purchase_agreements%rowtype;
begin
 if not coalesce(app.is_desktop() or app.is_collections(),false) then
   raise exception 'Payment access required' using errcode='insufficient_privilege';
 end if;
 select * into a from public.driver_purchase_agreements where id=app.agreement_for_day(p_vehicle_id,p_service_date);
 return jsonb_build_object('underAgreement',a.id is not null,
   'deferred',coalesce(a.schedule_effective_on<=p_service_date,false),
   'dailyAmountMinor',case when a.schedule_effective_on<=p_service_date then a.schedule_daily_amount_minor else null end);
end; $$;
revoke all on function public.vehicle_purchase_payment_context(uuid,date) from public,anon;
grant execute on function public.vehicle_purchase_payment_context(uuid,date) to authenticated;

create or replace function public.driver_purchase_progress(p_agreement_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
 a public.driver_purchase_agreements%rowtype;
 v_today date:=app.freetown_today(); v_asof date; v_end date;
 v_paid bigint:=0; v_schedule_paid bigint:=0; v_remaining bigint; v_scheduled bigint:=0;
 v_missing integer:=0; v_days integer:=0; v_delta bigint; v_adjustment integer:=0; v_date date;
begin
 if not coalesce(app.is_desktop(),false) then
   raise exception 'Only management may view purchase progress' using errcode='insufficient_privilege';
 end if;
 select * into a from public.driver_purchase_agreements where id=p_agreement_id;
 if not found then raise exception 'Agreement not found' using errcode='no_data_found'; end if;
 if a.schedule_closed_progress is not null then return a.schedule_closed_progress; end if;
 v_asof:=least(v_today,coalesce((a.cancelled_at at time zone 'Africa/Freetown')::date,v_today),
   coalesce((a.completed_at at time zone 'Africa/Freetown')::date,v_today));

 -- Historical untagged amounts retain the previous displayed allocation.
 select coalesce(sum(case when l.purchase_agreement_id=a.id then l.purchase_applied_minor else l.amount_minor end),0)
 into v_paid from public.ledger_entries l
 where l.superseded_by_id is null and l.direction='INCOME'
 and l.applies_to_date<=v_asof
 and (l.purchase_agreement_id=a.id or
   (l.purchase_agreement_id is null and l.vehicle_id=a.vehicle_id and l.category='DRIVER_PURCHASE_INSTALLMENT'
    and l.applies_to_date>=a.started_on and l.applies_to_date<=v_asof
    and not exists (select 1 from public.driver_purchase_agreements b
      where b.vehicle_id=a.vehicle_id and b.started_on>a.started_on and b.started_on<=l.applies_to_date)));
 -- A new settlement of this agreement's old installment debt also pays its principal;
 -- payments settling unrelated debt do not. The base installment has already counted above.
 select v_paid+coalesce(sum(s.amount_minor),0) into v_paid
 from public.balance_settlements s join public.outstanding_balances b on b.id=s.balance_id
 join public.daily_payment_records d on d.id=b.origin_daily_payment_id
 join public.ledger_entries l on l.id=s.ledger_entry_id
 where l.purchase_agreement_id=a.id and l.superseded_by_id is null
 and d.under_active_agreement and d.vehicle_id=a.vehicle_id and d.driver_id=a.driver_id
 and d.service_date>=a.started_on and d.service_date<a.schedule_effective_on;

 v_remaining:=greatest(a.agreement_amount_minor-v_paid,0);
 v_end:=v_asof-1;
 if exists(select 1 from public.daily_payment_records d where d.purchase_agreement_id=a.id
   and d.defer_installment and d.service_date=v_asof) then v_end:=v_asof; end if;

 -- Missing dates are projections only, never synthetic payment/ledger rows.
 if a.schedule_effective_on is not null and v_end>=a.schedule_effective_on then
   select count(*)::integer,
     count(*) filter(where d.id is null)::integer into v_days,v_missing
   from generate_series(0,v_end-a.schedule_effective_on) n
   left join public.daily_payment_records d on d.vehicle_id=a.vehicle_id and d.service_date=a.schedule_effective_on+n
   where d.id is null or d.defer_installment;
 end if;
 select coalesce(sum(l.purchase_applied_minor),0) into v_schedule_paid
 from public.ledger_entries l join public.daily_payment_records d on d.id=l.source_id
 where l.purchase_agreement_id=a.id and l.superseded_by_id is null and l.direction='INCOME'
   and l.source_type='DAILY_PAYMENT_RECORD' and d.defer_installment and d.service_date<=v_end;
 v_scheduled:=v_days*coalesce(a.schedule_daily_amount_minor,0);
 v_delta:=v_scheduled-v_schedule_paid;
 if a.schedule_daily_amount_minor>0 then
   -- Integer-only signed ceiling; sum first, then round once.
   v_adjustment:=(case when v_delta>0 then (v_delta+a.schedule_daily_amount_minor-1)/a.schedule_daily_amount_minor
                  else v_delta/a.schedule_daily_amount_minor end)::integer;
 end if;
 v_date:=coalesce(a.schedule_baseline_on,a.expected_completion_on)+v_adjustment;
 return jsonb_build_object('paidMinor',v_paid,'remainingMinor',v_remaining,
   'originalCompletionOn',a.expected_completion_on,'adjustedCompletionOn',v_date,
   'remainingDays',case when v_remaining=0 then 0 else greatest(v_date-v_asof,0) end,
   'adjustmentDays',v_adjustment,'missingDays',v_missing,'asOfDate',v_asof,
   'estimatedBaseline',a.expected_completion_on is null,'policyEffectiveOn',a.schedule_effective_on);
end; $$;
revoke all on function public.driver_purchase_progress(uuid) from public,anon;
grant execute on function public.driver_purchase_progress(uuid) to authenticated;

-- New columns inherit existing table RLS and append-only triggers; no new table
-- or additional client privileges. Callers cannot set server-owned snapshots.
comment on column public.daily_payment_records.defer_installment is
 'Server-owned policy snapshot; historical false values preserve original debt treatment.';
comment on column public.ledger_entries.purchase_applied_minor is
 'Purchase principal allocated once at insertion, excluding unrelated debt and held advance.';

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
    if v_dpr.purchase_agreement_id is not null then
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
  if not coalesce(app.is_desktop() or app.is_collections(),false) then
    raise exception 'Payment access required' using errcode='insufficient_privilege';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_record_id::text,0));
  select id into v_id from public.daily_payment_records where client_record_id=p_client_record_id;
  if found then
    if not exists(select 1 from public.daily_payment_records where id=v_id and vehicle_id=p_vehicle_id and service_date=p_service_date and day_outcome=p_day_outcome and received_amount_minor=p_received_amount_minor and shortfall_cause is not distinct from p_shortfall_cause and shortfall_note is not distinct from p_shortfall_note and overpayment_reason is not distinct from p_overpayment_reason) then
      raise exception 'Payment retry does not match original request' using errcode='check_violation';
    end if;
    return v_id;
  end if;
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
  if not coalesce(app.is_desktop() or app.is_collections(),false) then
    raise exception 'Payment access required' using errcode='insufficient_privilege';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_record_id::text,0));
  select id into v_bundle_id from public.bundled_payments where client_record_id=p_client_record_id;
  if found then
    if not exists(select 1 from public.bundled_payments where id=v_bundle_id and vehicle_id=p_vehicle_id and covers_from_date=p_covers_from_date and days_covered=p_days_covered and total_amount_minor=p_total_amount_minor) then
      raise exception 'Payment retry does not match original request' using errcode='check_violation';
    end if;
    return v_bundle_id;
  end if;
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


-- A zero-value superseding entry represents an approved correction to zero,
-- never a cash movement. Existing positive-only ordinary ledger rules remain.
alter table public.ledger_entries drop constraint ledger_entries_amount_minor_check;
alter table public.ledger_entries add constraint ledger_entries_amount_minor_check check (
 amount_minor>0 or (amount_minor=0 and purchase_agreement_id is not null and source_type='DAILY_PAYMENT_RECORD')
);

create or replace function public.correct_purchase_payment(
 p_client_record_id uuid, p_daily_payment_id uuid, p_amount_minor bigint, p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.daily_payment_records%rowtype; l public.ledger_entries%rowtype;
 a public.driver_purchase_agreements%rowtype; v_id uuid; v_c public.corrections%rowtype;
begin
 if not coalesce(app.is_owner(),false) then raise exception 'Only Owner/Admin may correct a purchase payment' using errcode='insufficient_privilege'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_record_id::text,0));
 select * into v_c from public.corrections where client_record_id=p_client_record_id;
 if found then
   if v_c.target_id<>p_daily_payment_id or v_c.after_json->>'amount_minor'<>p_amount_minor::text or v_c.reason<>btrim(p_reason) then
     raise exception 'Correction retry does not match original request' using errcode='check_violation';
   end if;
   return (v_c.after_json->>'ledger_entry_id')::uuid;
 end if;
 select * into d from public.daily_payment_records where id=p_daily_payment_id for update;
 if not found or not d.defer_installment then raise exception 'Only new-policy purchase installments can use this correction' using errcode='check_violation'; end if;
 select * into a from public.driver_purchase_agreements where id=d.purchase_agreement_id for update;
 if a.ownership_transfer_status not in ('NOT_STARTED','IN_PROGRESS') then raise exception 'This agreement is closed' using errcode='check_violation'; end if;
 if p_amount_minor is null or p_amount_minor<0 or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Enter a nonnegative amount and a reason' using errcode='check_violation'; end if;
 -- Credits and debt settlements have separate append-only histories; never
 -- silently reverse their allocation through an installment correction.
 if d.overpayment_reason in ('ADVANCE','SETTLING_BALANCE','OTHER') then raise exception 'This payment includes another allocation; review that allocation separately' using errcode='check_violation'; end if;
 if p_amount_minor>d.expected_amount_minor and d.overpayment_reason is distinct from 'PURCHASE_PAYMENT' then raise exception 'Record extra purchase money with its explicit payment purpose' using errcode='check_violation'; end if;
 if d.day_outcome in ('DRIVERS_DAY','DID_NOT_WORK') and p_amount_minor<>0 then raise exception 'This outcome must record zero; record the late purchase payment on the day received' using errcode='check_violation'; end if;
 select * into l from public.ledger_entries where source_type='DAILY_PAYMENT_RECORD' and source_id=d.id and superseded_by_id is null order by entered_at desc limit 1 for update;
 insert into public.ledger_entries(client_record_id,direction,amount_minor,category,applies_to_date,received_at,entered_by_user_id,vehicle_id,driver_id,source_type,source_id,note)
 values(p_client_record_id,'INCOME',p_amount_minor,'DRIVER_PURCHASE_INSTALLMENT',d.service_date,coalesce(l.received_at,app.freetown_today()),app.current_user_id(),d.vehicle_id,d.driver_id,'DAILY_PAYMENT_RECORD',d.id,btrim(p_reason)) returning id into v_id;
 if l.id is not null then update public.ledger_entries set superseded_by_id=v_id where id=l.id; end if;
 insert into public.corrections(client_record_id,target_table,target_id,reason,status,requested_by,approved_by,applied_at,before_json,after_json)
 values(p_client_record_id,'DAILY_PAYMENT_RECORD',d.id,btrim(p_reason),'APPLIED',app.current_user_id(),app.current_user_id(),now(),jsonb_build_object('amount_minor',coalesce(l.amount_minor,0),'ledger_entry_id',l.id),jsonb_build_object('amount_minor',p_amount_minor,'ledger_entry_id',v_id));
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,before_json,after_json)
 values(app.current_user_id(),'PURCHASE_PAYMENT_CORRECTED','DAILY_PAYMENT_RECORD',d.id,jsonb_build_object('amount_minor',coalesce(l.amount_minor,0)),jsonb_build_object('amount_minor',p_amount_minor));
 insert into public.activity_records(client_record_id,record_type,target_type,target_id,vehicle_id,driver_id,amount_minor,direction,applies_to_date,entered_by,summary_text)
 values(gen_random_uuid(),'CORRECTION_APPLIED','DAILY_PAYMENT_RECORD',d.id,d.vehicle_id,d.driver_id,p_amount_minor,'INCOME',d.service_date,app.current_user_id(),'Purchase payment corrected: '||btrim(p_reason));
 return v_id;
end; $$;
revoke all on function public.correct_purchase_payment(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.correct_purchase_payment(uuid,uuid,bigint,text) to authenticated;

create or replace function app.corrections_capture_before_json()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.target_table = 'VEHICLE' then
    select to_jsonb(v) - 'id' - 'client_record_id' - 'created_at' - 'archived_at' - 'photo_key'
      into new.before_json
    from public.vehicles v where v.id = new.target_id;
  elsif new.target_table = 'DRIVER' then
    select to_jsonb(d) - 'id' - 'client_record_id' - 'created_at'
                       - 'photo_key' - 'id_image_key' - 'licence_image_key'
      into new.before_json
    from public.drivers d where d.id = new.target_id;
  elsif new.target_table='DAILY_PAYMENT_RECORD' and new.status='APPLIED' and coalesce(app.is_owner(),false) then
    select jsonb_build_object('amount_minor',coalesce(l.amount_minor,0),'ledger_entry_id',l.id) into new.before_json
    from public.daily_payment_records d
    left join public.ledger_entries l on l.source_type='DAILY_PAYMENT_RECORD' and l.source_id=d.id and l.superseded_by_id=(new.after_json->>'ledger_entry_id')::uuid
    where d.id=new.target_id and d.defer_installment;
  else
    raise exception 'Corrections are only supported for VEHICLE and DRIVER right now'
      using errcode = 'feature_not_supported';
  end if;

  if new.before_json is null then
    raise exception 'Correction target not found' using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create or replace function app.activity_after_correction_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.status='APPLIED' then return null; end if;
  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id,
     vehicle_id, driver_id, applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'CORRECTION_REQUESTED', new.target_table, new.target_id,
     case when new.target_table = 'VEHICLE' then new.target_id end,
     case when new.target_table = 'DRIVER' then new.target_id end,
     app.freetown_today(), app.current_user_id(),
     format('Correction requested: %s', new.reason));
  return null;
end;
$$;
