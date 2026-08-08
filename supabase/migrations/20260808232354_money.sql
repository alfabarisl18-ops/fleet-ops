-- Fleet Operations SL — Phase 1 foundation
-- 05 · The records spine: ledger entries, corrections, activity records, audit log.

-- ---------------------------------------------------------------------------
-- ledger_entries
-- ---------------------------------------------------------------------------
-- Structural rules 1, 2 and 3 all land on this table:
--   1. amount_minor is a positive bigint in minor units; `direction` carries
--      the sign. Nothing here is ever negative, and nothing is ever a float.
--      Expenses render as -SLE 1,000 at the edge, not in storage.
--   2. applies_to_date is the day the money is *for*; received_at is the day it
--      actually arrived. Late bundled payments are impossible without both.
--   3. The row is append-only. A mistake produces a correction row and a
--      superseding entry; both stay in history.

create table public.ledger_entries (
  id                  uuid primary key default gen_random_uuid(),
  client_record_id    uuid not null unique default gen_random_uuid(),
  direction           public.ledger_direction not null,
  amount_minor        bigint not null check (amount_minor > 0),
  currency            text not null default 'SLE' check (currency = 'SLE'),
  category            public.ledger_category not null,
  subcategory         text,
  applies_to_date     date not null default app.freetown_today(),
  received_at         date not null default app.freetown_today(),
  entered_at          timestamptz not null default now(),
  entered_by_user_id  uuid not null references public.users (id),
  vehicle_id          uuid references public.vehicles (id) on delete restrict,
  driver_id           uuid references public.drivers (id) on delete restrict,
  source_type         public.entity_type,
  source_id           uuid,
  note                text,
  reconciled_at       timestamptz,
  reconciled_by       uuid references public.users (id),
  approval_status     public.approval_status not null default 'NOT_REQUIRED',
  superseded_by_id    uuid references public.ledger_entries (id),
  constraint ledger_entries_not_self_superseding check (superseded_by_id <> id),
  constraint ledger_entries_reconciled_pair
    check ((reconciled_at is null) = (reconciled_by is null)),
  constraint ledger_entries_source_pair
    check ((source_type is null) = (source_id is null))
);

comment on column public.ledger_entries.amount_minor is
  'Always positive, minor units (SLE x 100). Direction carries the sign.';
comment on column public.ledger_entries.applies_to_date is
  'The Freetown date the money is for. Never derived from a device clock.';
comment on column public.ledger_entries.received_at is
  'The Freetown date the money actually arrived. Not the same as applies_to_date '
  'for a late or bundled payment.';

-- Category has to agree with direction. SPEC section 3 lists the two sets.
alter table public.ledger_entries add constraint ledger_entries_category_matches_direction check (
  (direction = 'EXPENSE' and category in (
     'PARTS', 'LABOUR', 'MAINTENANCE', 'FUEL', 'ROAD_CHECKPOINT',
     'DRIVER_OR_HELPER_PAYMENT', 'VEHICLE_PURCHASE', 'LICENSING_INSURANCE',
     'OTHER_EXPENSE'))
  or
  (direction = 'INCOME' and category in (
     'DAILY_VEHICLE_PAYMENT', 'TRIP_REVENUE', 'BALANCE_SETTLEMENT',
     'DRIVER_PURCHASE_INSTALLMENT', 'OTHER_INCOME'))
);

create index ledger_entries_applies_to_idx on public.ledger_entries (applies_to_date desc);
create index ledger_entries_received_idx   on public.ledger_entries (received_at desc);
create index ledger_entries_vehicle_idx    on public.ledger_entries (vehicle_id, applies_to_date desc);
create index ledger_entries_driver_idx     on public.ledger_entries (driver_id, applies_to_date desc);
create index ledger_entries_category_idx   on public.ledger_entries (direction, category);
create index ledger_entries_source_idx     on public.ledger_entries (source_type, source_id);
create index ledger_entries_pending_idx    on public.ledger_entries (approval_status)
  where approval_status in ('PENDING', 'DISPUTED');
create index ledger_entries_unreconciled_idx on public.ledger_entries (applies_to_date)
  where reconciled_at is null;
create index ledger_entries_live_idx on public.ledger_entries (applies_to_date desc)
  where superseded_by_id is null;

create trigger ledger_entries_stamp_entered_at
  before insert on public.ledger_entries
  for each row execute function app.stamp_event_time('entered_at');

create trigger ledger_entries_applies_to_not_future
  before insert or update on public.ledger_entries
  for each row execute function app.reject_future_business_date('applies_to_date');

create trigger ledger_entries_received_at_not_future
  before insert or update on public.ledger_entries
  for each row execute function app.reject_future_business_date('received_at');

-- Append-only. The four columns named here are review metadata about a row
-- that is not itself changing: reconciliation, approval, and the pointer to
-- the entry that superseded this one. Every financial fact is frozen.
create trigger ledger_entries_append_only
  before update or delete on public.ledger_entries
  for each row execute function app.enforce_append_only(
    'reconciled_at', 'reconciled_by', 'approval_status', 'superseded_by_id');

-- ---------------------------------------------------------------------------
-- corrections
-- ---------------------------------------------------------------------------
-- The authorised workflow. Mobile roles create records but never edit them;
-- a mistake becomes a correction request that a desktop role approves.

create table public.corrections (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  target_table     public.entity_type not null,
  target_id        uuid not null,
  reason           text not null check (length(btrim(reason)) >= 3),
  status           public.correction_status not null default 'REQUESTED',
  requested_by     uuid not null references public.users (id),
  approved_by      uuid references public.users (id),
  requested_at     timestamptz not null default now(),
  applied_at       timestamptz,
  before_json      jsonb,
  after_json       jsonb
);

create index corrections_target_idx on public.corrections (target_table, target_id);
create index corrections_open_idx   on public.corrections (requested_at desc)
  where status = 'REQUESTED';

create trigger corrections_stamp_requested_at
  before insert on public.corrections
  for each row execute function app.stamp_event_time('requested_at');

-- ---------------------------------------------------------------------------
-- activity_records
-- ---------------------------------------------------------------------------
-- The Records page projection. Every workflow writes one row here, which is
-- what makes a single searchable, filterable, clickable surface possible across
-- payments, maintenance, trips and purchases.
--
-- Phase 1 creates the table and its policies. The triggers that populate it
-- from each workflow belong to Phase 4 (Records spine).

create table public.activity_records (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  record_type      text not null,
  target_type      public.entity_type not null,
  target_id        uuid not null,
  vehicle_id       uuid references public.vehicles (id) on delete restrict,
  driver_id        uuid references public.drivers (id) on delete restrict,
  amount_minor     bigint,
  direction        public.ledger_direction,
  applies_to_date  date,
  entered_at       timestamptz not null default now(),
  entered_by       uuid not null references public.users (id),
  summary_text     text not null,
  constraint activity_records_amount_pair
    check ((amount_minor is null) = (direction is null))
);

create index activity_records_recent_idx  on public.activity_records (entered_at desc);
create index activity_records_applies_idx on public.activity_records (applies_to_date desc);
create index activity_records_vehicle_idx on public.activity_records (vehicle_id, applies_to_date desc);
create index activity_records_driver_idx  on public.activity_records (driver_id, applies_to_date desc);
create index activity_records_type_idx    on public.activity_records (record_type);
create index activity_records_target_idx  on public.activity_records (target_type, target_id);

create trigger activity_records_stamp_entered_at
  before insert on public.activity_records
  for each row execute function app.stamp_event_time('entered_at');

create trigger activity_records_append_only
  before update or delete on public.activity_records
  for each row execute function app.enforce_append_only();

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
-- Written by the server only. No client has INSERT, and no client can amend it.

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_user_id uuid references public.users (id),
  action      text not null,
  entity_type public.entity_type not null,
  entity_id   uuid,
  before_json jsonb,
  after_json  jsonb,
  at          timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index audit_log_actor_idx  on public.audit_log (actor_user_id, at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.ledger_entries    enable row level security;
alter table public.corrections       enable row level security;
alter table public.activity_records  enable row level security;
alter table public.audit_log         enable row level security;

-- Ledger: desktop roles see everything. Collections & Finance records income
-- and expenses, so it can insert and can read back what it entered — it needs
-- that to show the operator what is already recorded for a vehicle-day.
create policy ledger_select_desktop on public.ledger_entries
  for select to authenticated using (app.is_desktop());

create policy ledger_select_own_collections on public.ledger_entries
  for select to authenticated
  using (app.is_collections() and entered_by_user_id = app.current_user_id());

create policy ledger_insert_collections on public.ledger_entries
  for insert to authenticated
  with check (
    app.is_collections()
    and entered_by_user_id = app.current_user_id()
  );

-- Maintenance & Repairs records parts and labour, which are expenses. It is
-- confined to those three categories and cannot record income.
create policy ledger_insert_maintenance on public.ledger_entries
  for insert to authenticated
  with check (
    app.is_maintenance()
    and entered_by_user_id = app.current_user_id()
    and direction = 'EXPENSE'
    and category in ('PARTS', 'LABOUR', 'MAINTENANCE')
  );

create policy ledger_select_own_maintenance on public.ledger_entries
  for select to authenticated
  using (app.is_maintenance() and entered_by_user_id = app.current_user_id());

create policy ledger_insert_desktop on public.ledger_entries
  for insert to authenticated
  with check (app.is_desktop() and entered_by_user_id = app.current_user_id());

-- Only desktop roles touch reconciliation and approval, and the append-only
-- trigger confines them to those columns whatever this policy allows.
create policy ledger_update_desktop on public.ledger_entries
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- Corrections: anyone signed in may request one against their own work;
-- only desktop roles see the queue and decide.
create policy corrections_select_desktop on public.corrections
  for select to authenticated using (app.is_desktop());
create policy corrections_select_own on public.corrections
  for select to authenticated using (requested_by = app.current_user_id());
create policy corrections_insert_signed_in on public.corrections
  for insert to authenticated
  with check (
    app.is_signed_in()
    and requested_by = app.current_user_id()
    and status = 'REQUESTED'
    and approved_by is null
    and applied_at is null
  );
create policy corrections_update_desktop on public.corrections
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- Activity records: desktop roles read the whole Records surface. Mobile roles
-- read back only what they entered, and can never amend it.
create policy activity_select_desktop on public.activity_records
  for select to authenticated using (app.is_desktop());
create policy activity_select_own on public.activity_records
  for select to authenticated using (entered_by = app.current_user_id());
create policy activity_insert_signed_in on public.activity_records
  for insert to authenticated
  with check (app.is_signed_in() and entered_by = app.current_user_id());

-- Audit log: Owner/Admin reads it. Nobody writes it from a client.
create policy audit_log_select_owner on public.audit_log
  for select to authenticated using (app.is_owner());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update on public.ledger_entries   to authenticated;
grant select, insert, update on public.corrections      to authenticated;
grant select, insert         on public.activity_records to authenticated;
grant select                 on public.audit_log        to authenticated;
