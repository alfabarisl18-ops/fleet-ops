-- Fleet Operations SL — Phase 1 foundation
-- 09 · Alerts.
--
-- Structural rule 5: an alert stores a concrete target — subject_type plus
-- subject_id — so tapping a notification opens the exact maintenance order,
-- balance or purchase goal, never a general list page. Both columns are NOT
-- NULL for that reason.

create table public.alerts (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  type             public.alert_type not null,
  severity         public.alert_severity not null default 'NORMAL',
  subject_type     public.entity_type not null,
  subject_id       uuid not null,
  vehicle_id       uuid references public.vehicles (id) on delete restrict,
  driver_id        uuid references public.drivers (id) on delete restrict,
  due_on           date,
  escalates_on     date,
  visible_to_roles public.user_role[] not null
                     check (cardinality(visible_to_roles) > 0),
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.users (id),
  resolved_at      timestamptz,
  resolved_by      uuid references public.users (id),
  constraint alerts_escalates_after_due
    check (escalates_on is null or due_on is null or escalates_on >= due_on),
  constraint alerts_reviewed_pair check ((reviewed_at is null) = (reviewed_by is null)),
  constraint alerts_resolved_pair check ((resolved_at is null) = (resolved_by is null))
);

comment on column public.alerts.visible_to_roles is
  'Which roles see this alert. Neither mobile workspace has an alerts bell, so '
  'in practice this is the two desktop roles — but the column, not the UI, is '
  'what decides.';

-- The open-alert count, and the ageing that makes severity more noticeable.
create index alerts_open_idx on public.alerts (severity, due_on)
  where resolved_at is null;
create index alerts_subject_idx on public.alerts (subject_type, subject_id);
create index alerts_vehicle_idx on public.alerts (vehicle_id) where resolved_at is null;
create index alerts_driver_idx  on public.alerts (driver_id)  where resolved_at is null;
create index alerts_roles_idx   on public.alerts using gin (visible_to_roles);

-- One live alert per type per subject, so a nightly job that re-evaluates
-- overdue balances does not stack duplicates on the same record.
create unique index alerts_one_live_per_subject
  on public.alerts (type, subject_type, subject_id)
  where resolved_at is null;

create trigger alerts_stamp_created_at
  before insert on public.alerts
  for each row execute function app.stamp_event_time('created_at');

alter table public.alerts enable row level security;

-- A role sees an alert only if its own role is named on the row.
create policy alerts_select_by_role on public.alerts
  for select to authenticated
  using (app.current_app_role() = any (visible_to_roles));

-- Alerts are raised by server-side jobs and workflows. Desktop roles may raise
-- one by hand; nobody else can.
create policy alerts_insert_desktop on public.alerts
  for insert to authenticated with check (app.is_desktop());

-- Reviewing and resolving is desktop work.
create policy alerts_update_desktop on public.alerts
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

grant select, insert, update on public.alerts to authenticated;
