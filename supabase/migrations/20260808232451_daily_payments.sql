-- Fleet Operations SL — Phase 1 foundation
-- 06 · Daily payments, bundled payments, balances, credits.
--
-- This file carries the rule that trips people up:
--
--   A payment shortfall becomes driver debt ONLY when the vehicle worked a
--   Full Day. Half Day, Driver's Day, Breakdown and Did Not Work shortfalls are
--   accepted losses — real money missing from the vehicle's target, but owed by
--   nobody.
--
-- `shortfall_treatment` is therefore a generated column. It is not defaulted,
-- not set by a trigger, and not exposed in any insert grant: the collector
-- physically cannot choose it, and neither can a compromised client.

-- ---------------------------------------------------------------------------
-- bundled_payments
-- ---------------------------------------------------------------------------
-- Several days paid together. covers_to_date is calculated from the start date
-- and the day count — the user never edits it (SPEC section 5).

create table public.bundled_payments (
  id                 uuid primary key default gen_random_uuid(),
  client_record_id   uuid not null unique default gen_random_uuid(),
  vehicle_id         uuid not null references public.vehicles (id) on delete restrict,
  driver_id          uuid references public.drivers (id) on delete restrict,
  total_amount_minor bigint not null check (total_amount_minor >= 0),
  received_at        date not null default app.freetown_today(),
  covers_from_date   date not null,
  days_covered       integer not null check (days_covered between 1 and 366),
  covers_to_date     date generated always as (covers_from_date + (days_covered - 1)) stored,
  note               text,
  entered_by         uuid not null references public.users (id),
  entered_at         timestamptz not null default now()
);

comment on column public.bundled_payments.covers_to_date is
  'Calculated from covers_from_date and days_covered. Never entered by hand.';
comment on column public.bundled_payments.received_at is
  'The Freetown date the money actually arrived, which for a late bundle is '
  'after every date it covers.';

create index bundled_payments_vehicle_idx on public.bundled_payments (vehicle_id, covers_from_date);
create index bundled_payments_driver_idx  on public.bundled_payments (driver_id);

create trigger bundled_payments_stamp_entered_at
  before insert on public.bundled_payments
  for each row execute function app.stamp_event_time('entered_at');

create trigger bundled_payments_received_at_not_future
  before insert or update on public.bundled_payments
  for each row execute function app.reject_future_business_date('received_at');

create trigger bundled_payments_covers_from_not_future
  before insert or update on public.bundled_payments
  for each row execute function app.reject_future_business_date('covers_from_date');

create trigger bundled_payments_append_only
  before update or delete on public.bundled_payments
  for each row execute function app.enforce_append_only();

-- ---------------------------------------------------------------------------
-- daily_payment_records
-- ---------------------------------------------------------------------------

create table public.daily_payment_records (
  id                     uuid primary key default gen_random_uuid(),
  client_record_id       uuid not null unique default gen_random_uuid(),
  vehicle_id             uuid not null references public.vehicles (id) on delete restrict,
  driver_id              uuid references public.drivers (id) on delete restrict,
  service_date           date not null default app.freetown_today(),
  day_outcome            public.day_outcome not null,
  expected_amount_minor  bigint not null check (expected_amount_minor >= 0),
  received_amount_minor  bigint not null default 0 check (received_amount_minor >= 0),

  shortfall_amount_minor bigint
    generated always as (greatest(expected_amount_minor - received_amount_minor, 0)) stored,

  shortfall_treatment    public.shortfall_treatment
    generated always as (
      case
        when received_amount_minor >= expected_amount_minor then null
        when day_outcome = 'FULL_DAY' then 'DRIVER_DEBT'::public.shortfall_treatment
        else 'ACCEPTED_LOSS'::public.shortfall_treatment
      end
    ) stored,

  shortfall_cause        public.shortfall_cause,
  shortfall_note         text,
  overpayment_reason     public.overpayment_reason,
  ledger_entry_id        uuid references public.ledger_entries (id),
  bundled_payment_id     uuid references public.bundled_payments (id),
  entered_by             uuid not null references public.users (id),
  entered_at             timestamptz not null default now()
);

comment on table public.daily_payment_records is
  'One record per vehicle per day. Two collectors recording the same vehicle-day '
  'collide on the unique index below and become a flagged duplicate for review, '
  'never a silent overwrite.';
comment on column public.daily_payment_records.expected_amount_minor is
  'Snapshot of the vehicle target on that date, taken by trigger. Not a live join.';
comment on column public.daily_payment_records.shortfall_treatment is
  'Derived from day_outcome. Only FULL_DAY produces DRIVER_DEBT. Generated, so '
  'it can never be selected by the person entering the record.';

-- SPEC section 3, stated outright: one record per vehicle per day.
create unique index daily_payment_records_vehicle_service_date_key
  on public.daily_payment_records (vehicle_id, service_date);

create index daily_payment_records_service_date_idx
  on public.daily_payment_records (service_date desc);
create index daily_payment_records_driver_idx
  on public.daily_payment_records (driver_id, service_date desc);
create index daily_payment_records_debt_idx
  on public.daily_payment_records (driver_id, service_date desc)
  where shortfall_treatment = 'DRIVER_DEBT';
create index daily_payment_records_bundle_idx
  on public.daily_payment_records (bundled_payment_id)
  where bundled_payment_id is not null;

-- A Half Day is a known disruption that cut the day short. SPEC requires a
-- cause: breakdown, accident, police or checkpoint issue, or other with a note.
alter table public.daily_payment_records add constraint dpr_half_day_requires_cause check (
  day_outcome <> 'HALF_DAY' or shortfall_cause is not null
);

alter table public.daily_payment_records add constraint dpr_other_cause_requires_note check (
  shortfall_cause is distinct from 'OTHER' or length(btrim(coalesce(shortfall_note, ''))) > 0
);

-- Driver's Day and Did Not Work record no amount at all.
alter table public.daily_payment_records add constraint dpr_zero_amount_outcomes check (
  day_outcome not in ('DRIVERS_DAY', 'DID_NOT_WORK') or received_amount_minor = 0
);

-- An overpayment is never applied silently: the person entering must pick a
-- reason before it can be saved.
alter table public.daily_payment_records add constraint dpr_overpayment_requires_reason check (
  received_amount_minor <= expected_amount_minor or overpayment_reason is not null
);

alter table public.daily_payment_records add constraint dpr_other_overpayment_requires_note check (
  overpayment_reason is distinct from 'OTHER' or length(btrim(coalesce(shortfall_note, ''))) > 0
);

-- Takes the expected-amount snapshot and the driver from the vehicle. A desktop
-- role may supply expected_amount_minor when backdating a day whose target
-- differed; a mobile role never can, whatever it sends.
create or replace function app.daily_payment_before_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  vehicle_target bigint;
  vehicle_driver uuid;
begin
  select v.expected_daily_amount_minor, v.current_driver_id
    into vehicle_target, vehicle_driver
  from public.vehicles v
  where v.id = new.vehicle_id;

  if new.expected_amount_minor is null or not app.is_desktop() then
    new.expected_amount_minor := coalesce(vehicle_target, 0);
  end if;

  if new.driver_id is null then
    new.driver_id := vehicle_driver;
  end if;

  new.entered_at := pg_catalog.now();

  return new;
end;
$$;

create trigger daily_payment_records_before_insert
  before insert on public.daily_payment_records
  for each row execute function app.daily_payment_before_insert();

create trigger daily_payment_records_service_date_not_future
  before insert or update on public.daily_payment_records
  for each row execute function app.reject_future_business_date('service_date');

-- The management override. SPEC section 5: "Owner/Admin or Fleet Manager can
-- convert it to driver debt on review." Kept as separate nullable columns
-- rather than letting anyone write to the derived one, so the original
-- derivation and the decision to depart from it are both visible for ever.
alter table public.daily_payment_records
  add column shortfall_treatment_override        public.shortfall_treatment,
  add column shortfall_treatment_override_by     uuid references public.users (id),
  add column shortfall_treatment_override_at     timestamptz,
  add column shortfall_treatment_override_reason text;

alter table public.daily_payment_records add constraint dpr_override_is_complete check (
  num_nonnulls(shortfall_treatment_override, shortfall_treatment_override_by,
               shortfall_treatment_override_at, shortfall_treatment_override_reason)
  in (0, 4)
);

comment on column public.daily_payment_records.shortfall_treatment_override is
  'Set only by Owner/Admin or Fleet Manager on review, and only for a shortfall '
  'that was accepted. The collector cannot forgive a debt or create one.';
comment on column public.daily_payment_records.shortfall_note is
  'The free-text note for this record. Required when shortfall_cause is OTHER '
  'and when overpayment_reason is OTHER.';

-- Append-only apart from that review. Every other column, including both
-- amounts and the day outcome, is frozen.
create trigger daily_payment_records_append_only
  before update or delete on public.daily_payment_records
  for each row execute function app.enforce_append_only(
    'shortfall_treatment_override', 'shortfall_treatment_override_by',
    'shortfall_treatment_override_at', 'shortfall_treatment_override_reason',
    'ledger_entry_id', 'bundled_payment_id');

-- ---------------------------------------------------------------------------
-- outstanding_balances
-- ---------------------------------------------------------------------------
-- Owned by the driver. vehicle_id and origin_daily_payment_id are context, not
-- owners: a balance follows the driver across vehicle changes.

create table public.outstanding_balances (
  id                       uuid primary key default gen_random_uuid(),
  client_record_id         uuid not null unique default gen_random_uuid(),
  driver_id                uuid not null references public.drivers (id) on delete restrict,
  vehicle_id               uuid references public.vehicles (id) on delete restrict,
  origin_daily_payment_id  uuid references public.daily_payment_records (id),
  original_amount_minor    bigint not null check (original_amount_minor > 0),
  remaining_amount_minor   bigint not null check (remaining_amount_minor >= 0),
  promised_date            date,
  reminder_date            date,
  status                   public.balance_status not null default 'OPEN',
  created_at               timestamptz not null default now(),
  closed_at                timestamptz,
  constraint ob_remaining_within_original
    check (remaining_amount_minor <= original_amount_minor),
  constraint ob_closed_when_settled
    check ((status in ('CLEARED', 'WRITTEN_OFF')) = (closed_at is not null))
);

comment on table public.outstanding_balances is
  'Money owed by a driver. Belongs to the driver, never the vehicle.';

create index outstanding_balances_driver_idx on public.outstanding_balances (driver_id)
  where status in ('OPEN', 'PARTIAL');
create index outstanding_balances_oldest_idx
  on public.outstanding_balances (driver_id, created_at)
  where status in ('OPEN', 'PARTIAL');
create index outstanding_balances_overdue_idx on public.outstanding_balances (promised_date)
  where status in ('OPEN', 'PARTIAL');
create unique index outstanding_balances_one_per_origin
  on public.outstanding_balances (origin_daily_payment_id)
  where origin_daily_payment_id is not null;

-- The amount owed can only go down. The driver, the origin and the original
-- amount are frozen.
create trigger outstanding_balances_append_only
  before update or delete on public.outstanding_balances
  for each row execute function app.enforce_append_only(
    'remaining_amount_minor', 'promised_date', 'reminder_date', 'status', 'closed_at');

create or replace function app.balance_never_increases()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.remaining_amount_minor > old.remaining_amount_minor then
    raise exception 'An outstanding balance cannot increase (% to %)',
      old.remaining_amount_minor, new.remaining_amount_minor
      using errcode = 'check_violation',
            hint = 'Record a new balance instead of enlarging this one.';
  end if;
  return new;
end;
$$;

create trigger outstanding_balances_never_increase
  before update on public.outstanding_balances
  for each row execute function app.balance_never_increases();

-- ---------------------------------------------------------------------------
-- balance_settlements
-- ---------------------------------------------------------------------------

create table public.balance_settlements (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  balance_id       uuid not null references public.outstanding_balances (id) on delete restrict,
  ledger_entry_id  uuid references public.ledger_entries (id),
  amount_minor     bigint not null check (amount_minor > 0),
  settled_on       date not null default app.freetown_today(),
  entered_by       uuid not null references public.users (id),
  entered_at       timestamptz not null default now()
);

create index balance_settlements_balance_idx on public.balance_settlements (balance_id, settled_on);

create trigger balance_settlements_stamp_entered_at
  before insert on public.balance_settlements
  for each row execute function app.stamp_event_time('entered_at');

create trigger balance_settlements_settled_on_not_future
  before insert or update on public.balance_settlements
  for each row execute function app.reject_future_business_date('settled_on');

create trigger balance_settlements_append_only
  before update or delete on public.balance_settlements
  for each row execute function app.enforce_append_only();

-- ---------------------------------------------------------------------------
-- driver_credits
-- ---------------------------------------------------------------------------
-- An overpayment taken as an advance on a future day is held here as credit,
-- rather than being applied silently.

create table public.driver_credits (
  id                      uuid primary key default gen_random_uuid(),
  client_record_id        uuid not null unique default gen_random_uuid(),
  driver_id               uuid not null references public.drivers (id) on delete restrict,
  amount_minor            bigint not null check (amount_minor > 0),
  remaining_minor         bigint not null check (remaining_minor >= 0),
  created_from_payment_id uuid references public.daily_payment_records (id),
  created_at              timestamptz not null default now(),
  consumed_on             date,
  constraint driver_credits_remaining_within_amount
    check (remaining_minor <= amount_minor)
);

create index driver_credits_driver_idx on public.driver_credits (driver_id, created_at)
  where remaining_minor > 0;

create trigger driver_credits_append_only
  before update or delete on public.driver_credits
  for each row execute function app.enforce_append_only(
    'remaining_minor', 'consumed_on');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.daily_payment_records enable row level security;
alter table public.bundled_payments      enable row level security;
alter table public.outstanding_balances  enable row level security;
alter table public.balance_settlements   enable row level security;
alter table public.driver_credits        enable row level security;

-- Collections & Finance is the role that records these. It reads them too:
-- the mobile screen has to show whether today is already recorded for a
-- vehicle, and an overpayment has to be shown against the driver's oldest open
-- balance before it can be applied.
create policy dpr_select_desktop_or_collections on public.daily_payment_records
  for select to authenticated using (app.is_desktop() or app.is_collections());
create policy dpr_insert_desktop_or_collections on public.daily_payment_records
  for insert to authenticated
  with check (
    (app.is_desktop() or app.is_collections())
    and entered_by = app.current_user_id()
    and shortfall_treatment_override is null
  );
-- Only management reviews an accepted shortfall and converts it.
create policy dpr_update_desktop on public.daily_payment_records
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy bundled_select_desktop_or_collections on public.bundled_payments
  for select to authenticated using (app.is_desktop() or app.is_collections());
create policy bundled_insert_desktop_or_collections on public.bundled_payments
  for insert to authenticated
  with check ((app.is_desktop() or app.is_collections()) and entered_by = app.current_user_id());

create policy ob_select_desktop_or_collections on public.outstanding_balances
  for select to authenticated using (app.is_desktop() or app.is_collections());
create policy ob_insert_desktop_or_collections on public.outstanding_balances
  for insert to authenticated with check (app.is_desktop() or app.is_collections());
-- A collector cannot forgive a debt: writing off or amending a balance is
-- management work.
create policy ob_update_desktop on public.outstanding_balances
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

create policy bs_select_desktop_or_collections on public.balance_settlements
  for select to authenticated using (app.is_desktop() or app.is_collections());
create policy bs_insert_desktop_or_collections on public.balance_settlements
  for insert to authenticated
  with check ((app.is_desktop() or app.is_collections()) and entered_by = app.current_user_id());

create policy dc_select_desktop_or_collections on public.driver_credits
  for select to authenticated using (app.is_desktop() or app.is_collections());
create policy dc_insert_desktop_or_collections on public.driver_credits
  for insert to authenticated with check (app.is_desktop() or app.is_collections());
create policy dc_update_desktop on public.driver_credits
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- daily_payment_records is granted column by column on INSERT. The generated
-- columns cannot be granted at all, and the override columns are deliberately
-- left out so a collector's client cannot even name them.

grant select on public.daily_payment_records to authenticated;
grant insert (
  id, client_record_id, vehicle_id, driver_id, service_date, day_outcome,
  expected_amount_minor, received_amount_minor, shortfall_cause, shortfall_note,
  overpayment_reason, ledger_entry_id, bundled_payment_id, entered_by
) on public.daily_payment_records to authenticated;
grant update (
  shortfall_treatment_override, shortfall_treatment_override_by,
  shortfall_treatment_override_at, shortfall_treatment_override_reason,
  ledger_entry_id, bundled_payment_id
) on public.daily_payment_records to authenticated;

grant select, insert         on public.bundled_payments     to authenticated;
grant select, insert, update on public.outstanding_balances to authenticated;
grant select, insert         on public.balance_settlements  to authenticated;
grant select, insert, update on public.driver_credits       to authenticated;
