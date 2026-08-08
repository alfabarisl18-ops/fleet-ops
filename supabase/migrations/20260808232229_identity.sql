-- Fleet Operations SL — Phase 1 foundation
-- 03 · Identity: users, PIN credentials, sessions, and the role helpers every
--      other policy in this database is built on.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Desktop roles sign in with email + password, held by Supabase Auth in
-- auth.users. Mobile roles sign in with a 4-digit PIN, which Supabase Auth has
-- no concept of; Phase 2 adds an Edge Function that verifies the PIN and mints
-- a session against a linked auth user.
--
-- `auth_user_id` is that link. It is nullable so a person can exist in the
-- business before an account is provisioned for them — which is exactly the
-- state the seed data leaves them in.
--
-- There is deliberately no `password_hash` column. SPEC section 3 lists one,
-- but Supabase Auth already stores the password hash in auth.users; a second
-- copy would be a second thing to leak and a second thing to rotate. The PIN
-- hash lives in app_private.user_pin_credentials, which no client can reach.

create table public.users (
  id             uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  auth_user_id   uuid unique references auth.users (id) on delete set null,
  display_name   text not null check (length(btrim(display_name)) between 1 and 120),
  role           public.user_role not null,
  email          text unique check (email is null or email = lower(email)),
  status         public.user_status not null default 'ACTIVE',
  created_by     uuid references public.users (id),
  created_at     timestamptz not null default now()
);

comment on table public.users is
  'People who sign in. Drivers are not users — see public.drivers.';
comment on column public.users.auth_user_id is
  'Link to Supabase Auth. Null until an account is provisioned in Phase 2.';
comment on column public.users.email is
  'Desktop roles only. Mobile roles authenticate by PIN and have no email.';

-- Desktop roles must have an email; mobile roles must not.
alter table public.users add constraint users_email_matches_role check (
  case
    when role in ('OWNER_ADMIN', 'FLEET_MANAGER') then email is not null
    else email is null
  end
);

create index users_role_idx   on public.users (role) where status = 'ACTIVE';
create index users_status_idx on public.users (status);

-- ---------------------------------------------------------------------------
-- PIN credentials — private schema, unreachable from any client
-- ---------------------------------------------------------------------------

create table app_private.user_pin_credentials (
  user_id       uuid primary key references public.users (id) on delete cascade,
  pin_hash      text not null,
  failed_count  integer not null default 0 check (failed_count >= 0),
  locked_until  timestamptz,
  set_by        uuid references public.users (id),
  set_at        timestamptz not null default now()
);

comment on table app_private.user_pin_credentials is
  'Bcrypt PIN hashes for mobile roles. Written only by the service role. '
  'Never selected by a client, never rendered, never logged.';

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
-- SPEC: no device binding. A PIN works on any device because these are field
-- tools, not personal devices. Rows are written by the server only.

create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  constraint sessions_expiry_after_issue check (expires_at > issued_at)
);

create index sessions_user_active_idx on public.sessions (user_id, expires_at desc)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so they can read public.users without being filtered by
-- that table's own policies — which would otherwise recurse infinitely.
-- A suspended or disabled user resolves to null and therefore fails every
-- policy in the database.

create or replace function app.current_user_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select u.id
  from public.users u
  where u.auth_user_id = (select auth.uid())
    and u.status = 'ACTIVE';
$$;

create or replace function app.current_app_role()
  returns public.user_role
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select u.role
  from public.users u
  where u.auth_user_id = (select auth.uid())
    and u.status = 'ACTIVE';
$$;

comment on function app.current_app_role() is
  'Application role of the signed-in user, or null. Not named current_role — '
  'that is a reserved SQL keyword.';

create or replace function app.has_role(variadic roles public.user_role[])
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select app.current_app_role() = any(roles);
$$;

-- Owner/Admin: everything, including people, roles, PINs and permissions.
create or replace function app.is_owner()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select app.current_app_role() = 'OWNER_ADMIN';
$$;

-- The two desktop roles. Full operational, financial and maintenance view.
create or replace function app.is_desktop()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select app.current_app_role() in ('OWNER_ADMIN', 'FLEET_MANAGER');
$$;

create or replace function app.is_collections()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select app.current_app_role() = 'COLLECTIONS_FINANCE';
$$;

create or replace function app.is_maintenance()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select app.current_app_role() = 'MAINTENANCE_REPAIRS';
$$;

create or replace function app.is_signed_in()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select app.current_app_role() is not null;
$$;

grant execute on function app.current_user_id()   to authenticated;
grant execute on function app.current_app_role()  to authenticated;
grant execute on function app.has_role(public.user_role[]) to authenticated;
grant execute on function app.is_owner()          to authenticated;
grant execute on function app.is_desktop()        to authenticated;
grant execute on function app.is_collections()    to authenticated;
grant execute on function app.is_maintenance()    to authenticated;
grant execute on function app.is_signed_in()      to authenticated;

-- ---------------------------------------------------------------------------
-- Append-only enforcement, used by every money table
-- ---------------------------------------------------------------------------
-- Structural rule 3: money rows are append-only. A mistake produces a
-- correction row that supersedes the original; both stay in history.
--
-- Taken literally that would also freeze reconciliation flags and approval
-- state, which are not restatements of what happened — they are review
-- metadata about a row that is not changing. So the trigger freezes the
-- financial facts (amounts, dates, direction, category, who and which vehicle)
-- and allows an explicit allow-list of review columns to move. Anything not on
-- the allow-list is rejected.
--
-- Argument: the columns that may be updated. Everything else is frozen.

create or replace function app.enforce_append_only()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  mutable_columns text[] := coalesce(tg_argv, array[]::text[]);
  changed_column  text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Rows in % are append-only and cannot be deleted', tg_table_name
      using errcode = 'restrict_violation',
            hint = 'Write a correction row that supersedes this one.';
  end if;

  -- Fully qualified: this function runs with an empty search_path.
  select o.key into changed_column
  from pg_catalog.jsonb_each(pg_catalog.to_jsonb(old)) o(key, value)
  where o.value is distinct from (pg_catalog.to_jsonb(new) -> o.key)
    and not (o.key = any(mutable_columns))
  limit 1;

  if changed_column is not null then
    raise exception 'Column %.% is append-only and cannot be updated',
      tg_table_name, changed_column
      using errcode = 'restrict_violation',
            hint = 'Write a correction row that supersedes this one.';
  end if;

  return new;
end;
$$;

comment on function app.enforce_append_only() is
  'BEFORE UPDATE OR DELETE trigger. Blocks all deletes, and blocks updates to '
  'any column not named in the trigger arguments.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.users    enable row level security;
alter table public.sessions enable row level security;

-- app_private is never granted to a client and is not an exposed schema, but
-- RLS is enabled anyway so a future mistake fails closed rather than open.
alter table app_private.user_pin_credentials enable row level security;

-- Everyone signed in can read the directory of people: the desktop workspaces
-- need it, and both mobile workspaces show who entered a record. No hashes or
-- credentials exist on this table to leak.
create policy users_select_signed_in on public.users
  for select to authenticated
  using (app.is_signed_in());

-- Only Owner/Admin manages people, roles, PINs and permissions. Fleet Manager
-- explicitly "cannot create administrators, change the Owner account, or
-- control system security", so it gets read access and nothing more.
create policy users_insert_owner on public.users
  for insert to authenticated
  with check (app.is_owner());

create policy users_update_owner on public.users
  for update to authenticated
  using (app.is_owner())
  with check (app.is_owner());

-- No delete policy anywhere in this database. People, vehicles and drivers are
-- retired by status, never removed.

create policy sessions_select_own on public.sessions
  for select to authenticated
  using (user_id = app.current_user_id() or app.is_owner());

-- No insert/update policy: sessions are minted by the server (service role),
-- which bypasses RLS.

grant select on public.users to authenticated;
grant insert (client_record_id, auth_user_id, display_name, role, email, status, created_by)
  on public.users to authenticated;
grant update (auth_user_id, display_name, role, email, status)
  on public.users to authenticated;

grant select on public.sessions to authenticated;
