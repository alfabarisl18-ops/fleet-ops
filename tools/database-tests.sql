
-- Local-only fixture; never run against a hosted database.
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.users(id,auth_user_id,display_name,role,email) values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Test manager','FLEET_MANAGER','route-test@example.com'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Test collector','COLLECTIONS_FINANCE',null);
insert into public.sessions(user_id,expires_at) values ('00000000-0000-0000-0000-000000000002',now()+interval '12 hours');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
insert into public.routes(id,name) values ('10000000-0000-0000-0000-000000000001','Test route A'),('10000000-0000-0000-0000-000000000002','Test route B');
insert into public.drivers(id,full_name) values ('20000000-0000-0000-0000-000000000001','Test driver');
insert into public.vehicles(id,fleet_id,type,route_id,expected_daily_amount_minor) values
 ('30000000-0000-0000-0000-000000000001','TEST-A','LONG_SPRINTER','10000000-0000-0000-0000-000000000001',50000),
 ('30000000-0000-0000-0000-000000000002','TEST-B','LONG_SPRINTER',null,50000);
select public.assign_driver_to_vehicle('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
select public.assign_driver_to_vehicle('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
do $$ begin
 assert (select route_id='10000000-0000-0000-0000-000000000002' from public.vehicles where fleet_id='TEST-A'), 'Vehicle route updated';
 assert (select count(*)=1 from public.driver_assignments), 'Retry creates no duplicate';
end $$;
select public.assign_driver_to_vehicle('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',null);
do $$ begin
 assert (select current_driver_id is null and route_id='10000000-0000-0000-0000-000000000002' from public.vehicles where fleet_id='TEST-A'), 'Transfer preserves old route';
 assert (select route_id is null from public.vehicles where fleet_id='TEST-B'), 'Explicit None clears route';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 begin
 perform public.assign_driver_to_vehicle(gen_random_uuid(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',null);
 raise exception 'Collector assignment unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Deterministic Freetown business clock, isolated test database only.
create or replace function app.freetown_today() returns date language sql stable as $$ select coalesce(nullif(current_setting('test.today',true),''),'2026-09-01')::date $$;
select set_config('test.today','2026-09-01',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select public.set_up_driver_purchase_agreement(gen_random_uuid(),'30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',3000000,50000,'DAILY','2026-08-01','2026-11-01');
do $$ declare a uuid; p jsonb; begin
 select id into a from public.driver_purchase_agreements where vehicle_id='30000000-0000-0000-0000-000000000002';
 p:=public.driver_purchase_progress(a);
 assert (p->>'adjustmentDays')::integer=0, 'Today missing is not overdue';
 perform set_config('test.today','2026-09-06',false);
 p:=public.driver_purchase_progress(a);
 assert (p->>'adjustmentDays')::integer=5 and (p->>'missingDays')::integer=5, 'Five unrecorded days add five days';
end $$;
select public.record_daily_payment('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','2026-09-01','FULL_DAY',25000);
select public.record_daily_payment('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','2026-09-01','FULL_DAY',25000);
select public.record_daily_payment(gen_random_uuid(),'30000000-0000-0000-0000-000000000002','2026-09-02','HALF_DAY',25000,'BREAKDOWN');
select public.record_bundled_payment('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','2026-09-03',3,150000);
select public.record_bundled_payment('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','2026-09-03',3,150000);
do $$ declare p jsonb; begin
 p:=public.driver_purchase_progress((select id from public.driver_purchase_agreements where vehicle_id='30000000-0000-0000-0000-000000000002'));
 assert (p->>'adjustmentDays')::integer=1, 'Two half installments accumulate into one deferred day';
 assert (p->>'paidMinor')::bigint=200000, 'Retries do not duplicate money';
 assert (p->>'missingDays')::integer=0, 'Late bundle removes missing reminders';
 assert not exists(select 1 from public.outstanding_balances where vehicle_id='30000000-0000-0000-0000-000000000002'), 'Purchase shortfalls create no debt';
 assert (select count(*)=2 from public.daily_payment_records where shortfall_treatment='DEFERRED_INSTALLMENT'), 'Full and half day shortfalls deferred';
end $$;
select public.record_daily_payment(gen_random_uuid(),'30000000-0000-0000-0000-000000000002','2026-09-06','FULL_DAY',150000,null,null,'PURCHASE_PAYMENT');
do $$ declare p jsonb; begin
 p:=public.driver_purchase_progress((select id from public.driver_purchase_agreements where vehicle_id='30000000-0000-0000-0000-000000000002'));
 assert (p->>'adjustmentDays')::integer=-1, 'Extra purchase payment shortens original schedule';
 assert (p->>'paidMinor')::bigint=350000, 'All explicit extra purchase money counts once';
end $$;
select set_config('test.today','2026-09-07',false);
select public.record_daily_payment(gen_random_uuid(),'30000000-0000-0000-0000-000000000002','2026-09-07','FULL_DAY',100000,null,null,'ADVANCE');
do $$ declare p jsonb; begin
 p:=public.driver_purchase_progress((select id from public.driver_purchase_agreements where vehicle_id='30000000-0000-0000-0000-000000000002'));
 assert (p->>'paidMinor')::bigint=400000, 'Held advance does not also pay principal';
 assert (p->>'adjustmentDays')::integer=-1, 'Held advance does not shorten schedule';
 assert (select sum(remaining_minor)=50000 from public.driver_credits), 'Advance remains available';
end $$;
-- Backdated pre-policy agreement payment still creates its original debt.
select public.record_daily_payment(gen_random_uuid(),'30000000-0000-0000-0000-000000000002','2026-08-31','BREAKDOWN',0);
do $$ begin
 assert (select count(*)=1 from public.outstanding_balances where vehicle_id='30000000-0000-0000-0000-000000000002'), 'Pre-policy backdates retain old debt';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ declare p jsonb; begin
 p:=public.vehicle_purchase_payment_context('30000000-0000-0000-0000-000000000002','2026-09-07');
 assert p->>'deferred'='true' and (select count(*)=3 from jsonb_object_keys(p)), 'Collector sees only date-specific collection context';
 begin
 perform public.driver_purchase_progress('00000000-0000-0000-0000-000000000000');
 raise exception 'Collector progress unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Upgrade leaves every legacy money/debt fact byte-for-byte equivalent.
do $$ declare r record; v jsonb; begin
 for r in select * from test_legacy_snapshot loop
 if r.kind='daily' then select to_jsonb(d)-'purchase_agreement_id'-'defer_installment' into v from public.daily_payment_records d where id=(r.value->>'id')::uuid;
 elsif r.kind='ledger' then select to_jsonb(l)-'purchase_agreement_id'-'purchase_applied_minor' into v from public.ledger_entries l where id=(r.value->>'id')::uuid;
 else select to_jsonb(b) into v from public.outstanding_balances b where id=(r.value->>'id')::uuid; end if;
 assert v=r.value, 'Historical money and debt must remain unchanged';
 end loop;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ declare a uuid; p jsonb; d uuid; v uuid; begin
 select id into a from public.driver_purchase_agreements where vehicle_id='30000000-0000-0000-0000-000000000002';
 select id into d from public.daily_payment_records where client_record_id='50000000-0000-0000-0000-000000000001';
 v:=public.correct_purchase_payment('70000000-0000-0000-0000-000000000001',d,50000,'Corrected count');
 assert v=public.correct_purchase_payment('70000000-0000-0000-0000-000000000001',d,50000,'Corrected count'), 'Correction retry idempotent';
 p:=public.driver_purchase_progress(a);
 assert (p->>'paidMinor')::bigint=425000, 'Replacement counted once, original excluded';
 assert (select received_amount_minor=25000 from public.daily_payment_records where id=d), 'Original daily amount immutable';
 perform public.correct_purchase_payment(gen_random_uuid(),d,0,'Actually no payment');
 p:=public.driver_purchase_progress(a);
 assert (p->>'paidMinor')::bigint=375000, 'Correction to zero removes prior principal';
 perform public.correct_purchase_payment(gen_random_uuid(),d,50000,'Verified full payment');
 perform public.complete_driver_purchase_agreement(a);
 p:=public.driver_purchase_progress(a);
 perform set_config('test.today','2026-10-07',false);
 assert public.driver_purchase_progress(a)=p, 'Completed schedule freezes';
end $$;
-- A new agreement without an end date derives its estimate at activation.
insert into public.drivers(id,full_name) values ('80000000-0000-0000-0000-000000000001','Estimate driver');
insert into public.vehicles(id,fleet_id,type,current_driver_id,expected_daily_amount_minor) values ('80000000-0000-0000-0000-000000000002','ESTIMATE','LONG_SPRINTER','80000000-0000-0000-0000-000000000001',50000);
select public.set_up_driver_purchase_agreement(gen_random_uuid(),'80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001',500000,350000,'WEEKLY','2026-09-01',null);
do $$ declare a uuid; p jsonb; begin
 select id into a from public.driver_purchase_agreements where vehicle_id='80000000-0000-0000-0000-000000000002';
 p:=public.driver_purchase_progress(a);
 assert p->>'adjustedCompletionOn'='2026-10-16' and p->>'estimatedBaseline'='true', 'Estimate starts at activation, ten installments';
 perform public.cancel_driver_purchase_agreement(a,'Test cancellation');
 p:=public.driver_purchase_progress(a);
 perform set_config('test.today','2026-11-07',false);
 assert public.driver_purchase_progress(a)=p, 'Cancelled schedule freezes';
end $$;
reset role;
