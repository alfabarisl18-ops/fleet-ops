-- Service is a zero-payment day; no monthly limit or maintenance side effect.
alter table public.daily_payment_records drop constraint dpr_zero_amount_outcomes;
alter table public.daily_payment_records add constraint dpr_zero_amount_outcomes check (
 day_outcome not in ('DRIVERS_DAY','SERVICE','DID_NOT_WORK') or received_amount_minor=0
);
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
    when 'SERVICE' then 'Service'
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

create or replace function app.purchase_ledger_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d public.daily_payment_records%rowtype;
begin
 new.purchase_agreement_id:=null;
 new.purchase_applied_minor:=0;
 if new.source_type='DAILY_PAYMENT_RECORD' and new.source_id is not null then
   select * into d from public.daily_payment_records where id=new.source_id;
   if d.day_outcome='SERVICE' and new.amount_minor<>0 then
     raise exception 'Service records zero payment; use Half Day when money was received' using errcode='check_violation';
   end if;
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