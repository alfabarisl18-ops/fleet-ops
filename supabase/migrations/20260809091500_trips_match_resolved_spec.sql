-- Fleet Operations SL — Phase 1 follow-up
-- 14 · Align public.trips with the resolved SPEC section on Trips.
--
-- SPEC section 3 (Trips) was rewritten resolving open question 1: box trucks
-- are paid per trip, not per day. This migration brings the table created in
-- 20260808232503_trips.sql in line with that rewrite. The table is empty —
-- Trips is a Phase 5 build item and no application code writes to it yet —
-- so this is a plain ALTER with no data to migrate.
--
-- What changes:
--   * origin / destination -> pickup_location / destination_location (rename,
--     not drop-and-add — no data to preserve, but a rename is still the
--     smaller, more honest diff).
--   * cargo -> folded into notes. See below for why.
--   * duration_days added: GENERATED ALWAYS from departed_on/returned_on,
--     same pattern as bundled_payments.covers_to_date.
--   * load_quantity, load_weight, load_weight_unit added.
--   * No money column is added, and that is verified below, not just
--     asserted in a comment. Trip revenue and costs stay out of this table
--     entirely and live in ledger_entries with source_type = 'TRIP',
--     source_id = trips.id — same as every other financial fact in this
--     database, and already what the table's original header comment said.
--   * RLS corrected: Collections & Finance can now read and insert trips.
--     The original policies were desktop-only, written before SPEC's Trips
--     rewrite put trip entry on the mobile Collections & Finance screen.

-- ---------------------------------------------------------------------------
-- weight_unit
-- ---------------------------------------------------------------------------

create type public.weight_unit as enum ('LB', 'KG');

comment on type public.weight_unit is
  'Switchable per trip entry so the collector is not stuck with one system. '
  'SPEC: "load_weight_unit (LB | KG), switchable per entry".';

-- ---------------------------------------------------------------------------
-- pickup_location / destination_location
-- ---------------------------------------------------------------------------

alter table public.trips rename column origin to pickup_location;
alter table public.trips rename column destination to destination_location;

-- ---------------------------------------------------------------------------
-- cargo -> folded into notes
-- ---------------------------------------------------------------------------
-- SPEC's rewritten Trips section replaces the old free-text `cargo` field with
-- the structured load_quantity / load_weight / load_weight_unit columns below,
-- and does not carry a separate cargo description forward as its own column.
-- Chose "fold into notes" over "drop outright": the mobile Trip entry screen
-- still ends on a free-text Note (SPEC step 7), and a description of what the
-- load actually was ("bags of rice", "furniture") reads naturally there rather
-- than being lost. Nothing to move — the table is empty.

comment on column public.trips.notes is
  'Free text. Also where a description of the load goes, if useful beyond '
  'load_quantity/load_weight — SPEC''s Trips rewrite replaced the old '
  'free-text cargo column with the structured load columns below and did '
  'not carry cargo forward as its own field.';

alter table public.trips drop column cargo;

-- ---------------------------------------------------------------------------
-- duration_days
-- ---------------------------------------------------------------------------
-- Same pattern as bundled_payments.covers_to_date: calculated, never entered
-- by hand. departed_on and returned_on are both nullable — a trip can be
-- logged as departed with no return yet — so no CASE is needed: date
-- arithmetic against a null column already produces null, exactly like
-- bundled_payments leaves covers_to_date null would if its own inputs could
-- be null (they can't, there; here they can).
--
-- Inclusive of both days, so a same-day trip is 1 day, matching the day-count
-- convention bundled_payments.days_covered already uses in this schema.

alter table public.trips
  add column duration_days integer
    generated always as ((returned_on - departed_on) + 1) stored;

comment on column public.trips.duration_days is
  'Calculated from departed_on and returned_on, inclusive of both days. Never '
  'entered by hand. Null until the trip has both a departure and a return date.';

-- ---------------------------------------------------------------------------
-- load_quantity, load_weight, load_weight_unit
-- ---------------------------------------------------------------------------
-- All three nullable. SPEC's mobile entry screen lists load quantity/weight/
-- unit as step 4, without marking it optional the way it explicitly marks
-- trip costs optional in step 6 — but the table has no application code
-- against it yet, and there's nothing in SPEC forcing a NOT NULL here ahead
-- of Phase 5 actually building the screen. Leaving them optional keeps this
-- migration a pure spec-alignment change rather than a new rule the schema
-- is inventing on its own.

alter table public.trips
  add column load_quantity   integer check (load_quantity >= 0),
  add column load_weight     numeric(10, 2) check (load_weight >= 0),
  add column load_weight_unit public.weight_unit;

comment on column public.trips.load_quantity is
  'Number of boxes/units. A count, not money.';
comment on column public.trips.load_weight is
  'Paired with load_weight_unit. A physical weight, not money — the '
  'numeric(10,2) type here is fine because "never numeric" in this codebase '
  'is a rule about *_minor money columns, not about every decimal quantity.';

alter table public.trips add constraint trips_load_weight_needs_unit check (
  (load_weight is null) = (load_weight_unit is null)
);

-- ---------------------------------------------------------------------------
-- No money on this table — verified, not just asserted in a comment
-- ---------------------------------------------------------------------------
-- SPEC is explicit: money is not stored on the trip row. This check runs once,
-- now, and fails the migration if a future edit to this file (or a careless
-- follow-up migration) ever adds a *_minor column here — the same guarantee
-- 20260808232711_guards.sql gives every other table in the database, applied
-- to this one table since it is the one place in the schema where a financial
-- fact is deliberately kept off the row it describes.

do $$
declare
  offenders text;
begin
  select string_agg(a.attname, ', ' order by a.attname) into offenders
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'trips'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname like '%\_minor';

  if offenders is not null then
    raise exception 'public.trips must carry no money column, found: %. '
      'Trip revenue and costs belong in ledger_entries with source_type = ''TRIP''.',
      offenders
      using errcode = 'check_violation';
  end if;
end;
$$;

-- No changes to grants. They are whole-table grants
-- (`select, insert, update on public.trips to authenticated`), so the renamed
-- and new columns are already covered — there is nothing column-specific to
-- add.

-- ---------------------------------------------------------------------------
-- RLS: Collections & Finance can enter trips too
-- ---------------------------------------------------------------------------
-- The original policies (20260808232503_trips.sql) restricted trips to
-- desktop roles, written before SPEC's Trips rewrite put trip entry on the
-- mobile screen: "Trip entry screen, mobile (Collections & Finance, under
-- Sprinter & Box-Truck Payment → box truck selected)". Both desktop roles and
-- Collections & Finance can now read and insert trips; only desktop can
-- update one — the same shape as every other mobile-insert table in this
-- schema (daily_payment_records, ledger_entries, maintenance_orders, ...):
-- a mobile role creates a record but never edits it.
--
-- Maintenance & Repairs still has no access here. SPEC scopes that role to
-- maintenance, problems, repairs, parts and vehicle status only — never
-- trips, and never money.

drop policy trips_select_desktop on public.trips;
drop policy trips_insert_desktop on public.trips;

create policy trips_select_desktop_or_collections on public.trips
  for select to authenticated
  using (app.is_desktop() or app.is_collections());

create policy trips_insert_desktop_or_collections on public.trips
  for insert to authenticated
  with check (
    (app.is_desktop() or app.is_collections())
    and entered_by = app.current_user_id()
  );

-- trips_update_desktop (update, desktop only) is untouched: mobile roles
-- create records but never edit them, so it does not need to change.
