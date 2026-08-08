-- Fleet Operations SL — Phase 1 foundation
-- 10 · Future purchases: goals, planned vehicles, landed cost, payments,
--      savings targets, cash reservations, transit.
--
-- Structural rule 6: acquisition costs link back to ledger entries so nothing
-- is counted twice. Every cost line and every payment carries a nullable
-- ledger_entry_id; when it is set, the money is already in Accounting and the
-- acquisition view must read it from there rather than add it again.
--
-- Structural rule 8: available cash is derived, never stored. There is no
-- `available_cash` column anywhere in this file, and there must never be one.

-- ---------------------------------------------------------------------------
-- purchase_goals
-- ---------------------------------------------------------------------------

create table public.purchase_goals (
  id                    uuid primary key default gen_random_uuid(),
  client_record_id      uuid not null unique default gen_random_uuid(),
  name                  text not null check (length(btrim(name)) between 1 and 160),
  vehicle_type          public.vehicle_type not null,
  custom_type           text,
  vehicles_required     integer not null default 1 check (vehicles_required > 0),
  condition             public.vehicle_condition,
  make                  text,
  model                 text,
  model_year            integer check (model_year between 1950 and 2100),
  color                 text,
  fuel_type             public.fuel_type,
  transmission          public.transmission_type,
  market_country        text,
  seller                text,
  intended_route        uuid references public.routes (id) on delete set null,
  target_purchase_date  date,
  expected_arrival_date date,
  priority              public.purchase_priority not null default 'MEDIUM',
  status                public.purchase_goal_status not null default 'ACTIVE',
  notes                 text,
  created_by            uuid not null references public.users (id),
  created_at            timestamptz not null default now(),
  constraint pgoal_custom_type_only_when_other check (
    case when vehicle_type = 'OTHER' then custom_type is not null
         else custom_type is null end
  ),
  constraint pgoal_arrival_after_purchase check (
    expected_arrival_date is null or target_purchase_date is null
    or expected_arrival_date >= target_purchase_date
  )
);

create index purchase_goals_status_idx on public.purchase_goals (status, priority);

-- ---------------------------------------------------------------------------
-- planned_vehicles
-- ---------------------------------------------------------------------------
-- One row per vehicle the goal intends to buy. The point of this table is to
-- follow one vehicle from savings goal, through purchase and transit, into the
-- active fleet without losing its history — `onboarded_vehicle_id` is where
-- that history joins up.

create table public.planned_vehicles (
  id                   uuid primary key default gen_random_uuid(),
  client_record_id     uuid not null unique default gen_random_uuid(),
  goal_id              uuid not null references public.purchase_goals (id) on delete restrict,
  sequence             integer not null check (sequence > 0),
  stage                public.purchase_stage not null default 'IDEA_CONSIDERING',
  target_date          date,
  purchased_at         date,
  onboarded_vehicle_id uuid unique references public.vehicles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  unique (goal_id, sequence)
);

create index planned_vehicles_stage_idx on public.planned_vehicles (stage);

-- ---------------------------------------------------------------------------
-- acquisition_cost_lines
-- ---------------------------------------------------------------------------
-- The landed-cost breakdown. Estimated and actual for each category, which is
-- what makes variance and over/under budget calculable.

create table public.acquisition_cost_lines (
  id                 uuid primary key default gen_random_uuid(),
  client_record_id   uuid not null unique default gen_random_uuid(),
  planned_vehicle_id uuid not null references public.planned_vehicles (id) on delete restrict,
  cost_category      public.acquisition_cost_category not null,
  estimated_minor    bigint check (estimated_minor >= 0),
  actual_minor       bigint check (actual_minor >= 0),
  ledger_entry_id    uuid references public.ledger_entries (id),
  note               text,
  created_at         timestamptz not null default now(),
  unique (planned_vehicle_id, cost_category)
);

comment on column public.acquisition_cost_lines.ledger_entry_id is
  'Set when this cost has already been recorded in Accounting. The landed-cost '
  'total must read it from the ledger rather than count actual_minor again.';

create index acl_planned_vehicle_idx on public.acquisition_cost_lines (planned_vehicle_id);

-- ---------------------------------------------------------------------------
-- acquisition_payments
-- ---------------------------------------------------------------------------
-- Deposit, installments, final. The only place in this database where a
-- currency other than SLE appears: an imported vehicle is paid for abroad, and
-- both the original amount and the SLE equivalent have to be kept.

create table public.acquisition_payments (
  id                     uuid primary key default gen_random_uuid(),
  client_record_id       uuid not null unique default gen_random_uuid(),
  planned_vehicle_id     uuid not null references public.planned_vehicles (id) on delete restrict,
  payment_type           public.acquisition_payment_type not null,
  amount_minor           bigint not null check (amount_minor > 0),
  paid_on                date not null default app.freetown_today(),
  method                 text,
  paid_to                text,
  original_currency      text check (original_currency is null
                                     or original_currency ~ '^[A-Z]{3}$'),
  original_amount_minor  bigint check (original_amount_minor > 0),
  exchange_rate          numeric(18, 8) check (exchange_rate > 0),
  receipt_document_id    uuid,   -- FK added in the documents migration
  ledger_entry_id        uuid references public.ledger_entries (id),
  next_due_on            date,
  entered_by             uuid not null references public.users (id),
  entered_at             timestamptz not null default now(),
  constraint ap_foreign_currency_is_complete check (
    num_nonnulls(original_currency, original_amount_minor, exchange_rate) in (0, 3)
  )
);

comment on column public.acquisition_payments.amount_minor is
  'The SLE equivalent, in minor units. This is the figure Accounting uses.';
comment on column public.acquisition_payments.exchange_rate is
  'Numeric, not money. This is a rate, not an amount — the SLE amount it '
  'produced is stored in amount_minor as an integer.';

create index ap_planned_vehicle_idx on public.acquisition_payments (planned_vehicle_id, paid_on);
create index ap_next_due_idx on public.acquisition_payments (next_due_on)
  where next_due_on is not null;

create trigger acquisition_payments_stamp_entered_at
  before insert on public.acquisition_payments
  for each row execute function app.stamp_event_time('entered_at');

create trigger acquisition_payments_paid_on_not_future
  before insert or update on public.acquisition_payments
  for each row execute function app.reject_future_business_date('paid_on');

create trigger acquisition_payments_append_only
  before update or delete on public.acquisition_payments
  for each row execute function app.enforce_append_only(
    'ledger_entry_id', 'receipt_document_id', 'next_due_on');

-- ---------------------------------------------------------------------------
-- savings_targets
-- ---------------------------------------------------------------------------

create table public.savings_targets (
  id                          uuid primary key default gen_random_uuid(),
  client_record_id            uuid not null unique default gen_random_uuid(),
  goal_id                     uuid not null unique
                                references public.purchase_goals (id) on delete restrict,
  total_budget_minor          bigint not null check (total_budget_minor > 0),
  target_date                 date,
  weekly_target_minor         bigint check (weekly_target_minor >= 0),
  monthly_target_minor        bigint check (monthly_target_minor >= 0),
  profit_reserve_pct          numeric(5, 2) check (profit_reserve_pct between 0 and 100),
  min_operating_cash_minor    bigint not null default 0
                                check (min_operating_cash_minor >= 0),
  min_emergency_reserve_minor bigint not null default 0
                                check (min_emergency_reserve_minor >= 0),
  created_at                  timestamptz not null default now()
);

comment on table public.savings_targets is
  'min_operating_cash_minor and min_emergency_reserve_minor exist so the '
  'funding view can never tell the user a vehicle is affordable on the total '
  'balance alone.';

-- ---------------------------------------------------------------------------
-- cash_reservations
-- ---------------------------------------------------------------------------

create table public.cash_reservations (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  goal_id          uuid not null references public.purchase_goals (id) on delete restrict,
  amount_minor     bigint not null check (amount_minor > 0),
  reserved_at      timestamptz not null default now(),
  reserved_by      uuid not null references public.users (id),
  released_at      timestamptz,
  released_by      uuid references public.users (id),
  note             text,
  constraint cr_released_pair check ((released_at is null) = (released_by is null))
);

create index cash_reservations_goal_idx on public.cash_reservations (goal_id)
  where released_at is null;

create trigger cash_reservations_append_only
  before update or delete on public.cash_reservations
  for each row execute function app.enforce_append_only(
    'released_at', 'released_by', 'note');

-- ---------------------------------------------------------------------------
-- transit_records
-- ---------------------------------------------------------------------------

create table public.transit_records (
  id                 uuid primary key default gen_random_uuid(),
  client_record_id   uuid not null unique default gen_random_uuid(),
  planned_vehicle_id uuid not null unique
                       references public.planned_vehicles (id) on delete restrict,
  vin                text,
  engine_number      text,
  mileage            integer check (mileage >= 0),
  condition          text,
  purchase_location  text,
  export_country     text,
  export_port        text,
  destination_port   text,
  shipping_company   text,
  vessel_name        text,
  bill_of_lading     text,
  shipped_on         date,
  expected_arrival   date,
  actual_arrival     date,
  current_location   text,
  clearing_agent     text,
  created_at         timestamptz not null default now(),
  constraint tr_arrival_after_shipping
    check (actual_arrival is null or shipped_on is null or actual_arrival >= shipped_on)
);

create index transit_records_expected_arrival_idx on public.transit_records (expected_arrival)
  where actual_arrival is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- The whole Future Purchases workspace is desktop only. SPEC gives Collections
-- & Finance payments, income and expenses; Maintenance & Repairs maintenance.
-- Neither has any business in acquisition planning, and deny-by-default means
-- writing no policy for them is all it takes.

alter table public.purchase_goals         enable row level security;
alter table public.planned_vehicles       enable row level security;
alter table public.acquisition_cost_lines enable row level security;
alter table public.acquisition_payments   enable row level security;
alter table public.savings_targets        enable row level security;
alter table public.cash_reservations      enable row level security;
alter table public.transit_records        enable row level security;

create policy purchase_goals_select on public.purchase_goals
  for select to authenticated using (app.is_desktop());
create policy purchase_goals_insert on public.purchase_goals
  for insert to authenticated
  with check (app.is_desktop() and created_by = app.current_user_id());
create policy purchase_goals_update on public.purchase_goals
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy planned_vehicles_select on public.planned_vehicles
  for select to authenticated using (app.is_desktop());
create policy planned_vehicles_insert on public.planned_vehicles
  for insert to authenticated with check (app.is_desktop());
create policy planned_vehicles_update on public.planned_vehicles
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy acl_select on public.acquisition_cost_lines
  for select to authenticated using (app.is_desktop());
create policy acl_insert on public.acquisition_cost_lines
  for insert to authenticated with check (app.is_desktop());
create policy acl_update on public.acquisition_cost_lines
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy ap_select on public.acquisition_payments
  for select to authenticated using (app.is_desktop());
create policy ap_insert on public.acquisition_payments
  for insert to authenticated
  with check (app.is_desktop() and entered_by = app.current_user_id());
create policy ap_update on public.acquisition_payments
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy savings_targets_select on public.savings_targets
  for select to authenticated using (app.is_desktop());
create policy savings_targets_insert on public.savings_targets
  for insert to authenticated with check (app.is_desktop());
create policy savings_targets_update on public.savings_targets
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- Reserving business cash against a goal is an Owner decision: it directly
-- reduces the money the operation can spend.
create policy cash_reservations_select on public.cash_reservations
  for select to authenticated using (app.is_desktop());
create policy cash_reservations_insert on public.cash_reservations
  for insert to authenticated
  with check (app.is_owner() and reserved_by = app.current_user_id());
create policy cash_reservations_update on public.cash_reservations
  for update to authenticated using (app.is_owner()) with check (app.is_owner());

create policy transit_records_select on public.transit_records
  for select to authenticated using (app.is_desktop());
create policy transit_records_insert on public.transit_records
  for insert to authenticated with check (app.is_desktop());
create policy transit_records_update on public.transit_records
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update on public.purchase_goals         to authenticated;
grant select, insert, update on public.planned_vehicles       to authenticated;
grant select, insert, update on public.acquisition_cost_lines to authenticated;
grant select, insert, update on public.acquisition_payments   to authenticated;
grant select, insert, update on public.savings_targets        to authenticated;
grant select, insert, update on public.cash_reservations      to authenticated;
grant select, insert, update on public.transit_records        to authenticated;
