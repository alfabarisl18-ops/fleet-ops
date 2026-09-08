
-- Local-only fixture; never run against a hosted database.
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.users(id,auth_user_id,display_name,role,email) values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Test manager','FLEET_MANAGER','route-test@example.com'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Test collector','COLLECTIONS_FINANCE',null);
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
