-- Fleet Operations SL — Phase 1 foundation
-- 01 · Schemas, deny-by-default posture, and server-side helper functions.
--
-- Two private schemas are created alongside `public`:
--   app          — helper functions used by RLS policies and triggers.
--   app_private  — secrets (PIN hashes). Never reachable from a client.
-- Neither is listed in the PostgREST exposed schemas, so nothing in them can be
-- called or read over the API. Only `public` is exposed.

create schema if not exists app;
create schema if not exists app_private;

comment on schema app is
  'Server-side helper functions for RLS and triggers. Not exposed through PostgREST.';
comment on schema app_private is
  'Secrets and internal tables. Never exposed through PostgREST, never granted to clients.';

-- ---------------------------------------------------------------------------
-- Deny by default
-- ---------------------------------------------------------------------------
-- Supabase ships with blanket grants on `public` to anon/authenticated. Remove
-- them and stop new tables inheriting them. Every table below then re-grants
-- exactly the privileges its policies need, and `anon` is granted nothing at
-- all anywhere in this database.

revoke all on schema app from public;
revoke all on schema app_private from public;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

grant usage on schema public to authenticated;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Business dates: Africa/Freetown, computed on the server, always
-- ---------------------------------------------------------------------------
-- Structural rule 9. The team is split across Freetown, the United States and
-- China, so three people can be on three different calendar days at the same
-- moment. `service_date`, `applies_to_date` and every other business date mean
-- the date in Freetown regardless of who is looking or what their device says.
--
-- Sierra Leone is UTC+00 with no daylight saving, but the zone name is used
-- rather than a fixed offset so this stays correct if that ever changes.

create or replace function app.freetown_today()
  returns date
  language sql
  stable
  set search_path = ''
as $$
  select (pg_catalog.now() at time zone 'Africa/Freetown')::date;
$$;

comment on function app.freetown_today() is
  'Today''s date in Africa/Freetown. The only correct source of a business date.';

-- Rejects a business date in the future. Attached to every business-date column
-- so a device with a wrong clock, or a client that computed the date locally,
-- cannot book a payment into tomorrow.
create or replace function app.reject_future_business_date()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  column_name text := tg_argv[0];
  supplied    date;
  freetown    date := app.freetown_today();
begin
  execute format('select ($1).%I', column_name) into supplied using new;

  if supplied is not null and supplied > freetown then
    raise exception
      'Business date %.% cannot be in the future (% is after % in Africa/Freetown)',
      tg_table_name, column_name, supplied, freetown
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function app.reject_future_business_date() is
  'BEFORE INSERT OR UPDATE trigger. Argument: the business-date column to check.';

-- Event timestamps are set by the server, never accepted from the client.
-- Argument: the timestamptz column to stamp.
create or replace function app.stamp_event_time()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Fully qualified because this function runs with an empty search_path.
  new := pg_catalog.json_populate_record(
           new, pg_catalog.json_build_object(tg_argv[0], pg_catalog.now()));
  return new;
end;
$$;

comment on function app.stamp_event_time() is
  'BEFORE INSERT trigger. Overwrites the named timestamptz column with now(), '
  'so an event time can never be supplied by a device.';

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
-- All four roles authenticate as the Postgres role `authenticated`; the
-- application role lives in public.users. These functions are SECURITY DEFINER
-- so they can read public.users without tripping that table's own policies
-- (which would otherwise recurse).
--
-- They are defined here as stubs and replaced in the identity migration, once
-- public.users exists.

create or replace function app.current_user_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select null::uuid;
$$;

comment on function app.current_user_id() is
  'public.users.id of the signed-in user, or null. Replaced in the identity migration.';

grant execute on function app.freetown_today() to authenticated;
grant execute on function app.current_user_id() to authenticated;
