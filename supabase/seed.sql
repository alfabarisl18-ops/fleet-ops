-- Fleet Operations SL — development seed data
--
-- Run automatically by `supabase db reset` against a local database, or by
-- `npm run db:seed` against a remote one.
--
-- Contents: 4 users (one per role), 3 drivers, 5 Sprinters, 1 box truck, and a
-- handful of routes.
--
-- NO CREDENTIALS. Not a password, not a PIN, not a hash, not a placeholder that
-- happens to work. Nothing in this file can sign anybody in. Every user row is
-- created with auth_user_id NULL, meaning the person exists in the business but
-- has no account yet; Phase 2 provisions accounts and PINs through Settings,
-- and app_private.user_pin_credentials stays empty until it does.
--
-- Every name, email, phone number, plate, route and money figure below is a
-- PLACEHOLDER. Replace them with the real fleet before this database carries
-- anything that matters. Emails use example.com, which RFC 2606 reserves and
-- which can never receive mail.
--
-- Idempotent: safe to run repeatedly.

begin;

-- ---------------------------------------------------------------------------
-- Routes — placeholder Freetown routes
-- ---------------------------------------------------------------------------

insert into public.routes (client_record_id, name, description) values
  ('11111111-0000-4000-8000-000000000001', 'Lumley – Congo Cross',  'Placeholder route.'),
  ('11111111-0000-4000-8000-000000000002', 'Kissy – PZ',            'Placeholder route.'),
  ('11111111-0000-4000-8000-000000000003', 'Waterloo – Town',       'Placeholder route.'),
  ('11111111-0000-4000-8000-000000000004', 'Goderich – Lumley',     'Placeholder route.'),
  ('11111111-0000-4000-8000-000000000005', 'Upcountry haulage',     'Placeholder. Box-truck work, not a fixed daily route.')
on conflict (client_record_id) do nothing;

-- ---------------------------------------------------------------------------
-- Users — one per role
-- ---------------------------------------------------------------------------
-- Desktop roles carry an email; mobile roles must not, and are reached by PIN.

insert into public.users (client_record_id, display_name, role, email, status) values
  ('22222222-0000-4000-8000-000000000001', 'A. Bangura', 'OWNER_ADMIN',         'owner@example.com',   'ACTIVE'),
  ('22222222-0000-4000-8000-000000000002', 'M. Sesay',   'FLEET_MANAGER',       'manager@example.com', 'ACTIVE'),
  ('22222222-0000-4000-8000-000000000003', 'F. Kamara',  'COLLECTIONS_FINANCE',  null,                 'ACTIVE'),
  ('22222222-0000-4000-8000-000000000004', 'I. Turay',   'MAINTENANCE_REPAIRS',  null,                 'ACTIVE')
on conflict (client_record_id) do nothing;

-- Everyone was created by the Owner.
update public.users u
set created_by = o.id
from public.users o
where o.client_record_id = '22222222-0000-4000-8000-000000000001'
  and u.created_by is null
  and u.id <> o.id;

-- ---------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------

insert into public.drivers (
  client_record_id, full_name, known_as, phone, address,
  next_of_kin_name, next_of_kin_phone, licence_number, licence_expiry,
  started_on, status
) values
  ('33333333-0000-4000-8000-000000000001', 'Mohamed Conteh',  'Mo',    '+23276000001',
   'Lumley, Freetown',    'Aminata Conteh',  '+23276000101', 'SL-DL-000001',
   app.freetown_today() + 210, app.freetown_today() - 400, 'ACTIVE'),
  ('33333333-0000-4000-8000-000000000002', 'Abu Bakarr Jalloh', 'Abu', '+23277000002',
   'Kissy, Freetown',     'Fatmata Jalloh',  '+23277000102', 'SL-DL-000002',
   app.freetown_today() + 95,  app.freetown_today() - 260, 'ACTIVE'),
  ('33333333-0000-4000-8000-000000000003', 'Santigie Koroma', 'Santi', '+23278000003',
   'Waterloo',            'Isata Koroma',    '+23278000103', 'SL-DL-000003',
   app.freetown_today() + 30,  app.freetown_today() - 120, 'ACTIVE')
on conflict (client_record_id) do nothing;

-- ---------------------------------------------------------------------------
-- Vehicles — 5 Sprinters and 1 box truck
-- ---------------------------------------------------------------------------
-- Targets are placeholders. SLE 900/day for a long Sprinter and SLE 700/day for
-- a short one, stored as minor units (SLE x 100), with a yearly target of
-- 300 working days at that rate.
--
-- The box truck's expected_daily_amount_minor is 0 on purpose: SPEC open
-- question 1 asks whether box trucks are paid per trip or per day, and that is
-- not answered yet. Zero means "no daily target set", not "expects nothing" —
-- a daily payment record against it would show a full shortfall, so no daily
-- records should be entered for it until the question is settled.

insert into public.vehicles (
  client_record_id, fleet_id, plate, type, color, distinguishing_marks,
  route_id, purchased_on, purchase_price_minor, entered_service_on,
  expected_daily_amount_minor, yearly_target_minor
)
select v.client_record_id, v.fleet_id, v.plate, v.type, v.color, v.marks,
       r.id, v.purchased_on, v.purchase_price_minor, v.entered_service_on,
       v.daily_minor, v.yearly_minor
from (values
  ('44444444-0000-4000-8000-000000000001'::uuid, 'SPR-01', 'AJK 411',
   'LONG_SPRINTER'::public.vehicle_type, 'White', 'Blue stripe along both sides',
   'Lumley – Congo Cross', (app.freetown_today() - 900)::date, 38000000::bigint,
   (app.freetown_today() - 880)::date, 90000::bigint, 27000000::bigint),

  ('44444444-0000-4000-8000-000000000002'::uuid, 'SPR-02', 'AJK 512',
   'LONG_SPRINTER'::public.vehicle_type, 'White', 'Roof rack fitted',
   'Kissy – PZ', (app.freetown_today() - 760)::date, 36500000::bigint,
   (app.freetown_today() - 740)::date, 90000::bigint, 27000000::bigint),

  ('44444444-0000-4000-8000-000000000003'::uuid, 'SPR-03', 'AJK 613',
   'LONG_SPRINTER'::public.vehicle_type, 'Silver', 'Repainted rear door',
   'Waterloo – Town', (app.freetown_today() - 540)::date, 41000000::bigint,
   (app.freetown_today() - 520)::date, 90000::bigint, 27000000::bigint),

  ('44444444-0000-4000-8000-000000000004'::uuid, 'SPR-04', 'AJK 714',
   'SHORT_SPRINTER'::public.vehicle_type, 'White', 'Dented left rear panel',
   'Goderich – Lumley', (app.freetown_today() - 430)::date, 29000000::bigint,
   (app.freetown_today() - 410)::date, 70000::bigint, 21000000::bigint),

  ('44444444-0000-4000-8000-000000000005'::uuid, 'SPR-05', 'AJK 815',
   'SHORT_SPRINTER'::public.vehicle_type, 'Grey', 'Sliding door replaced',
   'Lumley – Congo Cross', (app.freetown_today() - 300)::date, 31000000::bigint,
   (app.freetown_today() - 280)::date, 70000::bigint, 21000000::bigint),

  ('44444444-0000-4000-8000-000000000006'::uuid, 'TRK-01', 'AJT 101',
   'BOX_TRUCK'::public.vehicle_type, 'Blue', 'Business name on both doors',
   'Upcountry haulage', (app.freetown_today() - 620)::date, 95000000::bigint,
   (app.freetown_today() - 590)::date, 0::bigint, 40000000::bigint)
) as v (client_record_id, fleet_id, plate, type, color, marks, route_name,
        purchased_on, purchase_price_minor, entered_service_on,
        daily_minor, yearly_minor)
left join public.routes r on r.name = v.route_name
on conflict (client_record_id) do nothing;

-- ---------------------------------------------------------------------------
-- Driver assignments
-- ---------------------------------------------------------------------------
-- Three drivers on three Sprinters. The other three vehicles have no driver,
-- which is a state the screens must handle.

insert into public.driver_assignments (
  client_record_id, driver_id, vehicle_id, route_id, started_on
)
select a.client_record_id, d.id, v.id, v.route_id, d.started_on
from (values
  ('55555555-0000-4000-8000-000000000001'::uuid,
   '33333333-0000-4000-8000-000000000001'::uuid,
   '44444444-0000-4000-8000-000000000001'::uuid),
  ('55555555-0000-4000-8000-000000000002'::uuid,
   '33333333-0000-4000-8000-000000000002'::uuid,
   '44444444-0000-4000-8000-000000000002'::uuid),
  ('55555555-0000-4000-8000-000000000003'::uuid,
   '33333333-0000-4000-8000-000000000003'::uuid,
   '44444444-0000-4000-8000-000000000004'::uuid)
) as a (client_record_id, driver_crid, vehicle_crid)
join public.drivers  d on d.client_record_id = a.driver_crid
join public.vehicles v on v.client_record_id = a.vehicle_crid
on conflict (client_record_id) do nothing;

update public.vehicles v
set current_driver_id = da.driver_id
from public.driver_assignments da
where da.vehicle_id = v.id
  and da.ended_on is null
  and v.current_driver_id is distinct from da.driver_id;

-- ---------------------------------------------------------------------------
-- Vehicle status
-- ---------------------------------------------------------------------------
-- SPEC section 4 shows the fleet header reading "6 vehicles — 3 active,
-- 2 grounded, 1 in maintenance". The seed reproduces exactly that, so the
-- status counts, the status lights and the grounded list all have something
-- real to render.
--
-- Status is changed through vehicle_status_events, never by writing the column.
-- The trigger fills from_status from the vehicle and projects to_status back
-- onto it, which is also a live check that the projection works.

insert into public.vehicle_status_events (
  client_record_id, vehicle_id, to_status, changed_by, reason
)
select e.client_record_id, v.id, e.to_status, u.id, e.reason
from (values
  ('66666666-0000-4000-8000-000000000001'::uuid, 'SPR-03',
   'GROUNDED'::public.vehicle_status, 'Placeholder: awaiting parts.'),
  ('66666666-0000-4000-8000-000000000002'::uuid, 'SPR-05',
   'GROUNDED'::public.vehicle_status, 'Placeholder: gearbox problem reported.'),
  ('66666666-0000-4000-8000-000000000003'::uuid, 'TRK-01',
   'IN_MAINTENANCE'::public.vehicle_status, 'Placeholder: routine service.')
) as e (client_record_id, fleet_id, to_status, reason)
join public.vehicles v on v.fleet_id = e.fleet_id and v.status <> e.to_status
join public.users u on u.client_record_id = '22222222-0000-4000-8000-000000000002'
on conflict (client_record_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- What this seed deliberately does not create
-- ---------------------------------------------------------------------------
--   * No auth accounts, passwords or PINs — Phase 2.
--   * No ledger entries or daily payment records. Fabricated money would make
--     every Accounting total in Phase 8 a lie that looks like a bug.
--   * No maintenance orders, alerts or purchase goals — those phases seed their
--     own fixtures when there are screens to check them against.
