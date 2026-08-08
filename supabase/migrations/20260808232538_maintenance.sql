-- Fleet Operations SL — Phase 1 foundation
-- 08 · Maintenance: orders, status events, parts, notes.
--
-- No audio anywhere. Maintenance notes are typed text — there is no column here
-- for a recording, a transcript or a storage key to one, and there never will be.

-- ---------------------------------------------------------------------------
-- maintenance_orders
-- ---------------------------------------------------------------------------
-- `service_area` and `work_action` are text rather than enums. SPEC section 4
-- names the vehicle areas only by example, and enumerating them here would mean
-- guessing at a list and then migrating it. The allowed values live in the
-- shared constants file at the render layer; OIL_CHANGE is the one value the
-- database itself constrains, because SPEC states its rule outright.

create table public.maintenance_orders (
  id                       uuid primary key default gen_random_uuid(),
  client_record_id         uuid not null unique default gen_random_uuid(),
  vehicle_id               uuid not null references public.vehicles (id) on delete restrict,
  record_type              public.maintenance_record_type not null,
  service_area             text not null check (length(btrim(service_area)) > 0),
  work_action              text,
  problem_descriptor       public.problem_descriptor,
  status                   public.maintenance_status not null default 'PROBLEM_REPORTED',
  is_grounded              boolean not null default false,
  safety_status            public.roadworthiness not null default 'UNKNOWN',
  identified_on            date not null default app.freetown_today(),
  expected_inspection_on   date,
  expected_completion_on   date,
  estimated_grounded_days  integer check (estimated_grounded_days >= 0),
  handled_by               public.maintenance_handled_by,
  old_parts_returned       boolean,
  reminder_date            date,
  notes                    text,
  opened_by                uuid not null references public.users (id),
  opened_at                timestamptz not null default now(),
  closed_at                timestamptz,
  verified_by              uuid references public.users (id),
  constraint mo_inspection_after_identified
    check (expected_inspection_on is null or expected_inspection_on >= identified_on),
  constraint mo_completion_after_identified
    check (expected_completion_on is null or expected_completion_on >= identified_on)
);

comment on column public.maintenance_orders.safety_status is
  'Whether the vehicle is fit to drive. Deliberately not called "safe" — that '
  'word must never appear as a vehicle status.';

-- SPEC section 4: "Oil Change appears only under Regular Service." Problem
-- Reported and Repair show the other areas without it.
alter table public.maintenance_orders add constraint mo_oil_change_is_regular_service check (
  upper(btrim(service_area)) <> 'OIL_CHANGE' or record_type = 'REGULAR_SERVICE'
);

-- Selecting Oil Change auto-sets the work action to Oil Change.
alter table public.maintenance_orders add constraint mo_oil_change_sets_work_action check (
  upper(btrim(service_area)) <> 'OIL_CHANGE'
  or upper(btrim(coalesce(work_action, ''))) = 'OIL_CHANGE'
);

-- Problem Reported labels the work action "Problem Identified" and carries a
-- structured description of what is wrong.
alter table public.maintenance_orders add constraint mo_problem_requires_descriptor check (
  record_type <> 'PROBLEM_REPORTED' or problem_descriptor is not null
);

alter table public.maintenance_orders add constraint mo_closed_when_verified check (
  (status = 'COMPLETED_AND_VERIFIED') = (closed_at is not null)
);

create index maintenance_orders_vehicle_idx on public.maintenance_orders (vehicle_id, identified_on desc);
create index maintenance_orders_open_idx    on public.maintenance_orders (status)
  where closed_at is null;
create index maintenance_orders_grounded_idx on public.maintenance_orders (vehicle_id)
  where is_grounded and closed_at is null;
create index maintenance_orders_old_parts_idx on public.maintenance_orders (vehicle_id)
  where old_parts_returned is not true;
create index maintenance_orders_reminder_idx on public.maintenance_orders (reminder_date)
  where closed_at is null;

create trigger maintenance_orders_stamp_opened_at
  before insert on public.maintenance_orders
  for each row execute function app.stamp_event_time('opened_at');

create trigger maintenance_orders_identified_on_not_future
  before insert or update on public.maintenance_orders
  for each row execute function app.reject_future_business_date('identified_on');

-- ---------------------------------------------------------------------------
-- maintenance_status_events
-- ---------------------------------------------------------------------------
-- Structural rule 7 again: the order's status column is a projection of these
-- events, not the record of what happened.

create table public.maintenance_status_events (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  order_id         uuid not null references public.maintenance_orders (id) on delete restrict,
  from_status      public.maintenance_status,
  to_status        public.maintenance_status not null,
  changed_by       uuid not null references public.users (id),
  changed_at       timestamptz not null default now(),
  note             text
);

create index mse_order_idx on public.maintenance_status_events (order_id, changed_at desc);

create or replace function app.maintenance_status_event_before()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  select o.status into new.from_status
  from public.maintenance_orders o
  where o.id = new.order_id
  for update;

  new.changed_at := pg_catalog.now();
  new.changed_by := coalesce(app.current_user_id(), new.changed_by);

  if new.from_status = new.to_status then
    raise exception 'Maintenance order is already %', new.to_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- SECURITY DEFINER so the mobile Maintenance & Repairs role can move an order
-- forward without holding UPDATE on maintenance_orders.
create or replace function app.maintenance_status_event_after()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.maintenance_orders
  set status      = new.to_status,
      is_grounded = case
                      when new.to_status in ('RETURNED_TO_SERVICE', 'COMPLETED_AND_VERIFIED')
                        then false
                      when new.to_status = 'STILL_GROUNDED' then true
                      else is_grounded
                    end,
      closed_at   = case
                      when new.to_status = 'COMPLETED_AND_VERIFIED' then pg_catalog.now()
                      else null
                    end
  where id = new.order_id;

  return null;
end;
$$;

create trigger maintenance_status_events_before_insert
  before insert on public.maintenance_status_events
  for each row execute function app.maintenance_status_event_before();

create trigger maintenance_status_events_after_insert
  after insert on public.maintenance_status_events
  for each row execute function app.maintenance_status_event_after();

create trigger maintenance_status_events_append_only
  before update or delete on public.maintenance_status_events
  for each row execute function app.enforce_append_only();

-- ---------------------------------------------------------------------------
-- maintenance_parts
-- ---------------------------------------------------------------------------

create table public.maintenance_parts (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  order_id         uuid not null references public.maintenance_orders (id) on delete restrict,
  part_name        text not null check (length(btrim(part_name)) > 0),
  part_source      public.part_source not null default 'NONE',
  filter_action    public.filter_action,
  quantity         integer not null default 1 check (quantity > 0),
  unit_cost_minor  bigint not null default 0 check (unit_cost_minor >= 0),
  ledger_entry_id  uuid references public.ledger_entries (id),
  entered_by       uuid not null references public.users (id),
  entered_at       timestamptz not null default now()
);

comment on column public.maintenance_parts.filter_action is
  'Oil changes only: new filter installed, existing filter reused, or filter '
  'not changed.';

create index maintenance_parts_order_idx on public.maintenance_parts (order_id);
create index maintenance_parts_name_idx  on public.maintenance_parts (lower(part_name));

create trigger maintenance_parts_stamp_entered_at
  before insert on public.maintenance_parts
  for each row execute function app.stamp_event_time('entered_at');

-- A part costs money, so the row is append-only like every other money row.
create trigger maintenance_parts_append_only
  before update or delete on public.maintenance_parts
  for each row execute function app.enforce_append_only('ledger_entry_id');

-- ---------------------------------------------------------------------------
-- maintenance_notes
-- ---------------------------------------------------------------------------
-- Typed text, and only typed text. This is where the person who saw the problem
-- describes it, so the field is unbounded and the mobile screen must give it
-- real room.

create table public.maintenance_notes (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  order_id         uuid not null references public.maintenance_orders (id) on delete restrict,
  body_text        text not null check (length(btrim(body_text)) > 0),
  entered_by       uuid not null references public.users (id),
  entered_at       timestamptz not null default now()
);

create index maintenance_notes_order_idx on public.maintenance_notes (order_id, entered_at);

create trigger maintenance_notes_stamp_entered_at
  before insert on public.maintenance_notes
  for each row execute function app.stamp_event_time('entered_at');

create trigger maintenance_notes_append_only
  before update or delete on public.maintenance_notes
  for each row execute function app.enforce_append_only();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.maintenance_orders        enable row level security;
alter table public.maintenance_status_events enable row level security;
alter table public.maintenance_parts         enable row level security;
alter table public.maintenance_notes         enable row level security;

-- Desktop roles and the Maintenance & Repairs role. Collections & Finance
-- records money and nothing else, so it sees none of this.
create policy mo_select on public.maintenance_orders
  for select to authenticated using (app.is_desktop() or app.is_maintenance());
create policy mo_insert on public.maintenance_orders
  for insert to authenticated
  with check ((app.is_desktop() or app.is_maintenance()) and opened_by = app.current_user_id());
-- Mobile roles create records but never edit them.
create policy mo_update_desktop on public.maintenance_orders
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy mse_select on public.maintenance_status_events
  for select to authenticated using (app.is_desktop() or app.is_maintenance());
create policy mse_insert on public.maintenance_status_events
  for insert to authenticated with check (app.is_desktop() or app.is_maintenance());

create policy mp_select on public.maintenance_parts
  for select to authenticated using (app.is_desktop() or app.is_maintenance());
create policy mp_insert on public.maintenance_parts
  for insert to authenticated
  with check ((app.is_desktop() or app.is_maintenance()) and entered_by = app.current_user_id());
create policy mp_update_desktop on public.maintenance_parts
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy mn_select on public.maintenance_notes
  for select to authenticated using (app.is_desktop() or app.is_maintenance());
create policy mn_insert on public.maintenance_notes
  for insert to authenticated
  with check ((app.is_desktop() or app.is_maintenance()) and entered_by = app.current_user_id());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update on public.maintenance_orders        to authenticated;
grant select, insert         on public.maintenance_status_events to authenticated;
grant select, insert, update on public.maintenance_parts         to authenticated;
grant select, insert         on public.maintenance_notes         to authenticated;
