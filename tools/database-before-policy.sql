-- Isolated upgrade fixture, never hosted.
create or replace function app.freetown_today() returns date language sql stable as $$ select '2026-09-01'::date $$;
insert into auth.users(id) values ('90000000-0000-0000-0000-000000000001');
insert into public.users(id,auth_user_id,display_name,role,email) values ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Legacy owner','OWNER_ADMIN','legacy-test@example.com');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',false);
insert into public.drivers(id,full_name) values ('90000000-0000-0000-0000-000000000002','Legacy driver');
insert into public.vehicles(id,fleet_id,type,current_driver_id,expected_daily_amount_minor) values ('90000000-0000-0000-0000-000000000003','LEGACY','LONG_SPRINTER','90000000-0000-0000-0000-000000000002',50000);
select public.set_up_driver_purchase_agreement(gen_random_uuid(),'90000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000002',3000000,50000,'DAILY','2026-08-01','2026-11-01');
select public.record_daily_payment(gen_random_uuid(),'90000000-0000-0000-0000-000000000003','2026-08-30','FULL_DAY',50000);
select public.record_daily_payment(gen_random_uuid(),'90000000-0000-0000-0000-000000000003','2026-08-31','BREAKDOWN',0);
create temp table test_legacy_snapshot as select 'daily' kind,to_jsonb(d) value from public.daily_payment_records d union all select 'ledger',to_jsonb(l) from public.ledger_entries l union all select 'debt',to_jsonb(b) from public.outstanding_balances b;
