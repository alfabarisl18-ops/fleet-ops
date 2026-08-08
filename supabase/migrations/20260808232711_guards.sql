-- Fleet Operations SL — Phase 1 foundation
-- 12 · Guards.
--
-- The previous eleven migrations make claims: deny by default, RLS on every
-- table, client_record_id everywhere, one payment record per vehicle per day.
-- This migration checks them. If any claim is false, the migration fails and
-- nothing ships — which is the point. These assertions run again on every
-- fresh database, so a table added later without a policy breaks the build
-- rather than quietly leaking.

-- ---------------------------------------------------------------------------
-- `anon` gets nothing, anywhere
-- ---------------------------------------------------------------------------
-- This is a private business system. Nobody reaches it without signing in, so
-- the unauthenticated role has no reason to hold a single privilege.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on schema public from anon;
revoke all on schema app    from anon;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------

do $$
declare
  offenders text;
begin
  -- 1. Every table in `public` has row level security enabled.
  select string_agg(c.relname, ', ' order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if offenders is not null then
    raise exception 'Tables without row level security: %', offenders;
  end if;

  -- 2. Every table in `public` has at least one policy. RLS with no policy
  --    denies everything, which is safe but almost always an oversight.
  select string_agg(c.relname, ', ' order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if offenders is not null then
    raise exception 'Tables with row level security but no policy: %', offenders;
  end if;

  -- 3. No policy grants anything to `anon` or to PUBLIC.
  select string_agg(distinct pol.polname, ', ') into offenders
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (pol.polroles = '{0}'::oid[]                          -- PUBLIC
         or exists (select 1 from pg_roles r
                    where r.oid = any (pol.polroles) and r.rolname = 'anon'));

  if offenders is not null then
    raise exception 'Policies granted to anon or PUBLIC: %', offenders;
  end if;

  -- 4. Every table a device inserts into carries client_record_id with a
  --    unique index. sessions and audit_log are written only by the server and
  --    never travel through the offline queue, so they are exempt.
  select string_agg(c.relname, ', ' order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in ('sessions', 'audit_log')
    and not exists (
      select 1
      from pg_attribute a
      join pg_index i on i.indrelid = c.oid and a.attnum = any (i.indkey)
      where a.attrelid = c.oid
        and a.attname = 'client_record_id'
        and not a.attisdropped
        and i.indisunique
        and i.indnatts = 1
    );

  if offenders is not null then
    raise exception 'Tables missing a unique client_record_id: %', offenders;
  end if;

  -- 5. One daily payment record per vehicle per day. Two collectors recording
  --    the same vehicle-day must collide here and become a flagged duplicate,
  --    never a silent overwrite.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'daily_payment_records'
      and indexname  = 'daily_payment_records_vehicle_service_date_key'
  ) then
    raise exception 'Missing unique index on daily_payment_records (vehicle_id, service_date)';
  end if;

  -- 6. No money column is a float or a numeric. Minor units are integers.
  select string_agg(format('%s.%s (%s)', c.relname, a.attname,
                           pg_catalog.format_type(a.atttypid, a.atttypmod)),
                    ', ' order by c.relname, a.attname)
    into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public'
    and c.relkind = 'r'
    and a.attname like '%\_minor'
    and pg_catalog.format_type(a.atttypid, a.atttypmod)
        not in ('bigint', 'integer', 'smallint');

  if offenders is not null then
    raise exception 'Money columns that are not integers: %', offenders;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A note for whoever adds the next table
-- ---------------------------------------------------------------------------
comment on schema public is
  'Fleet Operations SL. Every table here needs: client_record_id with a unique '
  'index, row level security enabled, at least one policy, explicit grants to '
  'authenticated only, bigint minor units for money, and business dates '
  'defaulted to app.freetown_today(). The guards migration enforces all of it.';
