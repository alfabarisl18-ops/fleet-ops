-- Fleet Operations SL — Phase 1 foundation
-- 04 · Fleet: routes, vehicles, drivers, assignments, purchase agreements.
--
-- Money is bigint minor units (SLE x 100) throughout. int4 tops out at
-- SLE 21,474,836.47, which a single imported vehicle or a multi-vehicle savings
-- target can exceed; bigint costs four extra bytes and removes the question.
-- Values stay far below 2^53, so they survive JSON as exact JavaScript numbers.

-- ---------------------------------------------------------------------------
-- routes
-- ---------------------------------------------------------------------------

create table public.routes (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  name             text not null unique check (length(btrim(name)) between 1 and 120),
  description      text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id                          uuid primary key default gen_random_uuid(),
  client_record_id            uuid not null unique default gen_random_uuid(),
  fleet_id                    text not null unique
                                check (length(btrim(fleet_id)) between 1 and 40),
  plate                       text unique,
  type                        public.vehicle_type not null,
  custom_type                 text,
  custom_description          text,
  color                       text,
  distinguishing_marks        text,
  photo_key                   text,
  route_id                    uuid references public.routes (id) on delete set null,
  current_driver_id           uuid,   -- FK added after public.drivers exists
  purchased_on                date,
  purchase_price_minor        bigint check (purchase_price_minor >= 0),
  entered_service_on          date,
  status                      public.vehicle_status not null default 'ACTIVE',
  expected_daily_amount_minor bigint not null default 0
                                check (expected_daily_amount_minor >= 0),
  yearly_target_minor         bigint not null default 0
                                check (yearly_target_minor >= 0),
  expected_retirement_on      date,
  archived_at                 timestamptz,
  created_at                  timestamptz not null default now()
);

comment on column public.vehicles.fleet_id is
  'Internal fleet identifier shown throughout the UI, e.g. SPR-01.';
comment on column public.vehicles.status is
  'Displayed as Active / Grounded / In maintenance. Maintained by the trigger '
  'on vehicle_status_events — do not write it directly.';

-- "Other" is the only type that carries a free-text description.
alter table public.vehicles add constraint vehicles_custom_type_only_when_other check (
  case when type = 'OTHER' then custom_type is not null
       else custom_type is null end
);

alter table public.vehicles add constraint vehicles_archived_at_matches_status check (
  (status = 'ARCHIVED') = (archived_at is not null)
);

create index vehicles_status_idx  on public.vehicles (status);
create index vehicles_type_idx    on public.vehicles (type) where status <> 'ARCHIVED';
create index vehicles_route_idx   on public.vehicles (route_id);
create index vehicles_driver_idx  on public.vehicles (current_driver_id);

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
-- Drivers do not sign in. They are subjects, not users. A driver is never
-- deleted — status moves to FORMER.

create table public.drivers (
  id                  uuid primary key default gen_random_uuid(),
  client_record_id    uuid not null unique default gen_random_uuid(),
  full_name           text not null check (length(btrim(full_name)) between 1 and 160),
  known_as            text,
  phone               text,
  phone_alt           text,
  address             text,
  next_of_kin_name    text,
  next_of_kin_phone   text,
  photo_key           text,
  id_document_type    text,
  id_document_number  text,
  id_image_key        text,
  licence_number      text,
  licence_expiry      date,
  licence_image_key   text,
  started_on          date,
  left_on             date,
  leave_reason        text,
  status              public.driver_status not null default 'ACTIVE',
  notes               text,
  created_at          timestamptz not null default now(),
  constraint drivers_left_after_started check (left_on is null or started_on is null
                                               or left_on >= started_on),
  constraint drivers_former_has_left_on check (status <> 'FORMER' or left_on is not null)
);

comment on table public.drivers is
  'Everyone who has driven for the business, present and past. Money owed lives '
  'here, on the driver, not on the vehicle — it follows them across vehicle changes.';
comment on column public.drivers.id_image_key is
  'Owner/Admin and Fleet Manager only. Enforced by column-level grant.';
comment on column public.drivers.licence_image_key is
  'Owner/Admin and Fleet Manager only. Enforced by column-level grant.';

create index drivers_status_idx  on public.drivers (status);
create index drivers_name_idx    on public.drivers (lower(full_name));
create index drivers_licence_expiry_idx on public.drivers (licence_expiry)
  where status = 'ACTIVE';

alter table public.vehicles
  add constraint vehicles_current_driver_fk
  foreign key (current_driver_id) references public.drivers (id) on delete set null;

-- ---------------------------------------------------------------------------
-- vehicle_status_events
-- ---------------------------------------------------------------------------
-- Structural rule 7: status changes are events recording who changed what and
-- when, not just a column. vehicles.status is a projection of the latest event.

create table public.vehicle_status_events (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles (id) on delete restrict,
  from_status      public.vehicle_status,
  to_status        public.vehicle_status not null,
  changed_by       uuid not null references public.users (id),
  changed_at       timestamptz not null default now(),
  reason           text
);

create index vehicle_status_events_vehicle_idx
  on public.vehicle_status_events (vehicle_id, changed_at desc);

-- Fills from_status from the vehicle's current status, so a device cannot
-- report a transition that did not happen, and stamps the server time.
create or replace function app.vehicle_status_event_before()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  select v.status into new.from_status
  from public.vehicles v
  where v.id = new.vehicle_id
  for update;

  new.changed_at := pg_catalog.now();
  new.changed_by := coalesce(app.current_user_id(), new.changed_by);

  if new.from_status = new.to_status then
    raise exception 'Vehicle is already %', new.to_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Applies the event to the vehicle. SECURITY DEFINER so the mobile
-- Maintenance & Repairs role can move a vehicle Grounded <-> Active without
-- holding UPDATE on public.vehicles.
create or replace function app.vehicle_status_event_after()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.vehicles
  set status = new.to_status,
      archived_at = case when new.to_status = 'ARCHIVED' then pg_catalog.now() else null end
  where id = new.vehicle_id;

  return null;
end;
$$;

create trigger vehicle_status_events_before_insert
  before insert on public.vehicle_status_events
  for each row execute function app.vehicle_status_event_before();

create trigger vehicle_status_events_after_insert
  after insert on public.vehicle_status_events
  for each row execute function app.vehicle_status_event_after();

create trigger vehicle_status_events_append_only
  before update or delete on public.vehicle_status_events
  for each row execute function app.enforce_append_only();

-- ---------------------------------------------------------------------------
-- driver_assignments
-- ---------------------------------------------------------------------------

create table public.driver_assignments (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  driver_id        uuid not null references public.drivers (id) on delete restrict,
  vehicle_id       uuid not null references public.vehicles (id) on delete restrict,
  route_id         uuid references public.routes (id) on delete set null,
  started_on       date not null default app.freetown_today(),
  ended_on         date,
  created_at       timestamptz not null default now(),
  constraint driver_assignments_ended_after_started
    check (ended_on is null or ended_on >= started_on)
);

-- One open assignment per vehicle, and one per driver.
create unique index driver_assignments_one_open_per_vehicle
  on public.driver_assignments (vehicle_id) where ended_on is null;
create unique index driver_assignments_one_open_per_driver
  on public.driver_assignments (driver_id) where ended_on is null;
create index driver_assignments_driver_idx on public.driver_assignments (driver_id, started_on desc);

create trigger driver_assignments_started_on_not_future
  before insert or update on public.driver_assignments
  for each row execute function app.reject_future_business_date('started_on');

-- ---------------------------------------------------------------------------
-- driver_purchase_agreements
-- ---------------------------------------------------------------------------

create table public.driver_purchase_agreements (
  id                        uuid primary key default gen_random_uuid(),
  client_record_id          uuid not null unique default gen_random_uuid(),
  vehicle_id                uuid not null references public.vehicles (id) on delete restrict,
  driver_id                 uuid not null references public.drivers (id) on delete restrict,
  agreement_amount_minor    bigint not null check (agreement_amount_minor > 0),
  regular_payment_minor     bigint not null check (regular_payment_minor > 0),
  payment_frequency         public.payment_frequency not null,
  started_on                date not null,
  expected_completion_on    date,
  ownership_transfer_status public.ownership_transfer_status not null default 'NOT_STARTED',
  created_at                timestamptz not null default now(),
  constraint dpa_completion_after_start
    check (expected_completion_on is null or expected_completion_on >= started_on)
);

create unique index dpa_one_open_per_vehicle
  on public.driver_purchase_agreements (vehicle_id)
  where ownership_transfer_status <> 'CANCELLED';
create index dpa_driver_idx on public.driver_purchase_agreements (driver_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.routes                     enable row level security;
alter table public.vehicles                   enable row level security;
alter table public.drivers                    enable row level security;
alter table public.vehicle_status_events      enable row level security;
alter table public.driver_assignments         enable row level security;
alter table public.driver_purchase_agreements enable row level security;

-- Routes and vehicles: every signed-in role reads them. Both mobile workspaces
-- start by picking a vehicle.
create policy routes_select_signed_in on public.routes
  for select to authenticated using (app.is_signed_in());
create policy routes_write_desktop on public.routes
  for insert to authenticated with check (app.is_desktop());
create policy routes_update_desktop on public.routes
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy vehicles_select_signed_in on public.vehicles
  for select to authenticated using (app.is_signed_in());
create policy vehicles_insert_desktop on public.vehicles
  for insert to authenticated with check (app.is_desktop());
create policy vehicles_update_desktop on public.vehicles
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- Drivers: readable by everyone signed in — Collections needs the name against
-- a balance, Maintenance needs to say who was driving. The ID and licence image
-- keys are withheld from mobile roles by column-level grant, below.
create policy drivers_select_signed_in on public.drivers
  for select to authenticated using (app.is_signed_in());
create policy drivers_insert_desktop on public.drivers
  for insert to authenticated with check (app.is_desktop());
create policy drivers_update_desktop on public.drivers
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- Vehicle status: desktop roles and the Maintenance & Repairs role. SPEC
-- section 6 gives that role vehicle-status tools; Collections & Finance
-- records money and nothing else.
create policy vse_select_not_collections on public.vehicle_status_events
  for select to authenticated
  using (app.is_desktop() or app.is_maintenance());
create policy vse_insert_desktop_or_maintenance on public.vehicle_status_events
  for insert to authenticated
  with check (app.is_desktop() or app.is_maintenance());

create policy driver_assignments_select_signed_in on public.driver_assignments
  for select to authenticated using (app.is_signed_in());
create policy driver_assignments_insert_desktop on public.driver_assignments
  for insert to authenticated with check (app.is_desktop());
create policy driver_assignments_update_desktop on public.driver_assignments
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- Purchase agreements are a financial contract: desktop only.
create policy dpa_select_desktop on public.driver_purchase_agreements
  for select to authenticated using (app.is_desktop());
create policy dpa_insert_desktop on public.driver_purchase_agreements
  for insert to authenticated with check (app.is_desktop());
create policy dpa_update_desktop on public.driver_purchase_agreements
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- `authenticated` covers all four application roles; the policies above are
-- what separates them. `anon` is granted nothing, here or anywhere.

grant select, insert, update on public.routes                     to authenticated;
grant select, insert, update on public.vehicles                   to authenticated;
grant select, insert, update on public.driver_assignments         to authenticated;
grant select, insert, update on public.driver_purchase_agreements to authenticated;
grant select, insert         on public.vehicle_status_events      to authenticated;
grant insert, update         on public.drivers                    to authenticated;

-- Column-level SELECT on drivers. SPEC section 3: "Driver ID and licence images
-- are visible to Owner/Admin and Fleet Manager only." A policy cannot express
-- that, because a policy filters rows, not columns — so the two image-key
-- columns are simply not granted to the `authenticated` role at all, and are
-- read through a security-definer accessor added in Phase 3 for desktop roles.
--
-- Consequence for the data layer: queries against drivers must list columns
-- explicitly. `select('*')` will fail. That is deliberate.
grant select (
  id, client_record_id, full_name, known_as, phone, phone_alt, address,
  next_of_kin_name, next_of_kin_phone, photo_key, id_document_type,
  id_document_number, licence_number, licence_expiry, started_on, left_on,
  leave_reason, status, notes, created_at
) on public.drivers to authenticated;
