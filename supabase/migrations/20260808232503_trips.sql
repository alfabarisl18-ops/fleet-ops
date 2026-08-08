-- Fleet Operations SL — Phase 1 foundation
-- 07 · Trips.
--
-- Revenue and costs do not live here. They attach as ledger entries with
-- source_type = 'TRIP' and source_id = the trip, so the box-truck trip
-- contribution in Accounting is computed from the one ledger everything else
-- uses, and nothing is counted twice.

create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles (id) on delete restrict,
  driver_id        uuid references public.drivers (id) on delete restrict,
  helper_name      text,
  origin           text,
  destination      text,
  cargo            text,
  departed_on      date,
  returned_on      date,
  status           public.trip_status not null default 'PLANNED',
  notes            text,
  entered_by       uuid not null references public.users (id),
  created_at       timestamptz not null default now(),
  constraint trips_returned_after_departed
    check (returned_on is null or departed_on is null or returned_on >= departed_on)
);

create index trips_vehicle_idx  on public.trips (vehicle_id, departed_on desc);
create index trips_driver_idx   on public.trips (driver_id, departed_on desc);
create index trips_open_idx     on public.trips (status) where status in ('PLANNED', 'IN_PROGRESS');

create trigger trips_departed_on_not_future
  before insert or update on public.trips
  for each row execute function app.reject_future_business_date('departed_on');

create trigger trips_returned_on_not_future
  before insert or update on public.trips
  for each row execute function app.reject_future_business_date('returned_on');

alter table public.trips enable row level security;

-- Trips are a desktop workspace concern: SPEC gives Collections & Finance
-- payments, income and expenses, and Maintenance & Repairs maintenance only.
create policy trips_select_desktop on public.trips
  for select to authenticated using (app.is_desktop());
create policy trips_insert_desktop on public.trips
  for insert to authenticated
  with check (app.is_desktop() and entered_by = app.current_user_id());
create policy trips_update_desktop on public.trips
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

grant select, insert, update on public.trips to authenticated;
