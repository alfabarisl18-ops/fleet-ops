-- Fleet Operations SL — Phase 2 auth
-- PIN sign-in: idle-gated sessions, PIN verification and throttling, PIN
-- reset, and the mobile roster picker.
--
-- See docs/decisions/0007-pin-sign-in-becomes-a-real-session.md for why this
-- is shaped the way it is — in particular why the functions below live in
-- `public` rather than `app_private`, which was the first draft and was
-- proven wrong by testing before this was written: PostgREST rejects any
-- schema outside {public, graphql_public} for every caller, service_role
-- included, before it ever looks at a grant. `app_private` stays exactly as
-- unreachable as Phase 1 left it; these functions are the one narrow,
-- audited door into it, same pattern as public.driver_identity_images().

-- ---------------------------------------------------------------------------
-- sessions: idle-timeout tracking
-- ---------------------------------------------------------------------------
-- Supabase's own session/refresh-token lifecycle has no idle concept — a
-- refresh token stays valid indefinitely as long as something refreshes it.
-- SPEC requires mobile sessions to expire on inactivity, so that's enforced
-- one layer up, by the role helpers below, using this column.

alter table public.sessions add column last_seen_at timestamptz not null default now();

comment on column public.sessions.last_seen_at is
  'Updated by public.touch_session(). A mobile session idle for more than 30 '
  'minutes stops resolving to a role in app.current_app_role(), regardless of '
  'whether the underlying Supabase JWT is still technically valid.';
comment on column public.sessions.expires_at is
  'Hard cap set at mint time (12 hours for a PIN session), independent of '
  'last_seen_at. Continuous activity does not extend it — a fresh PIN is '
  'required at least once per shift.';
comment on table public.sessions is
  'Written only by the server. In practice this table is mobile-only: desktop '
  'roles authenticate through Supabase Auth alone and never get a row here — '
  'SPEC says desktop sessions follow normal Supabase defaults, so nothing '
  'extra is tracked for them. The shape stays role-agnostic in case that ever '
  'changes.';

-- ---------------------------------------------------------------------------
-- Role helpers: idle-gated for mobile roles, unchanged for desktop
-- ---------------------------------------------------------------------------
-- Every RLS policy in this database calls one of these two functions, or one
-- of the four thin wrappers built on current_app_role() (is_desktop,
-- is_collections, is_maintenance, is_owner, is_signed_in). That makes this
-- the one place inactivity needs to be enforced — not the ~90 policies that
-- already exist, and not the ones Phase 3 onward will add without knowing
-- this rule exists.
--
-- Desktop roles resolve exactly as they did in Phase 1: auth_user_id matches,
-- status is ACTIVE, nothing else asked. "Normal Supabase defaults", per SPEC.
-- Mobile roles additionally require a live public.sessions row: not revoked,
-- its 12-hour hard cap not passed, and touched within the last 30 minutes.

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
    and u.status = 'ACTIVE'
    and (
      u.role in ('OWNER_ADMIN', 'FLEET_MANAGER')
      or exists (
        select 1
        from public.sessions s
        where s.user_id = u.id
          and s.revoked_at is null
          and s.expires_at > pg_catalog.now()
          and s.last_seen_at > pg_catalog.now() - interval '30 minutes'
      )
    );
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
    and u.status = 'ACTIVE'
    and (
      u.role in ('OWNER_ADMIN', 'FLEET_MANAGER')
      or exists (
        select 1
        from public.sessions s
        where s.user_id = u.id
          and s.revoked_at is null
          and s.expires_at > pg_catalog.now()
          and s.last_seen_at > pg_catalog.now() - interval '30 minutes'
      )
    );
$$;

comment on function app.current_user_id() is
  'public.users.id of the signed-in user, or null. For a mobile role this '
  'also requires a live, non-idle public.sessions row — see '
  'docs/decisions/0007.';
comment on function app.current_app_role() is
  'Application role of the signed-in user, or null. Same idle gate as '
  'current_user_id(). Every other role helper (is_desktop, is_collections, '
  'is_maintenance, is_owner, is_signed_in) is built on this one, so this is '
  'the single choke point for every RLS policy in the database.';

-- ---------------------------------------------------------------------------
-- PIN verification and throttling
-- ---------------------------------------------------------------------------
-- 5 consecutive wrong guesses locks the account for 15 minutes. An attempt
-- made while already locked is rejected without comparing the PIN at all,
-- and does not extend the lock or touch failed_count — otherwise an attacker
-- could keep a legitimate user locked out forever just by continuing to
-- guess. See docs/decisions/0007 for the reasoning behind these numbers.
--
-- Every failure path returns the same reason as a wrong PIN. Distinguishing
-- "no such account", "not a PIN role", "suspended" or "locked" to the caller
-- would let an unauthenticated client enumerate valid staff identifiers for
-- free — the roster picker already tells them who exists, deliberately, but
-- nothing should tell them anything about whether a specific guess landed
-- closer than another.

create type public.pin_check_result as (
  ok           boolean,
  auth_user_id uuid,
  locked_until timestamptz,
  reason       text  -- 'ok' | 'invalid_pin' | 'locked' | 'not_provisioned'
);

comment on type public.pin_check_result is
  'reason is for the Edge Function''s own branching and logs, not for '
  'display. Every reason except ok and locked renders the same generic '
  '"Incorrect PIN" to the person typing — see the no-enumeration note above.';

create or replace function public.verify_pin(p_user_id uuid, p_pin text)
  returns public.pin_check_result
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_role         public.user_role;
  v_status       public.user_status;
  v_auth_user_id uuid;
  v_hash         text;
  v_failed       integer;
  v_locked_until timestamptz;
  v_now          timestamptz := pg_catalog.now();
  v_result       public.pin_check_result;
begin
  select u.role, u.status, u.auth_user_id
    into v_role, v_status, v_auth_user_id
  from public.users u
  where u.id = p_user_id;

  if not found
     or v_role not in ('COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS')
     or v_status <> 'ACTIVE'
  then
    v_result.ok := false;
    v_result.reason := 'invalid_pin';
    return v_result;
  end if;

  -- Row lock: two concurrent attempts against the same account must not both
  -- read failed_count before either writes it, or the lockout can be raced.
  select c.pin_hash, c.failed_count, c.locked_until
    into v_hash, v_failed, v_locked_until
  from app_private.user_pin_credentials c
  where c.user_id = p_user_id
  for update;

  if not found then
    -- A mobile-role account with no credential row at all: never had a PIN
    -- set. Same generic response — this is indistinguishable from a wrong
    -- PIN to the caller, on purpose.
    v_result.ok := false;
    v_result.reason := 'invalid_pin';
    return v_result;
  end if;

  if v_locked_until is not null and v_locked_until > v_now then
    v_result.ok := false;
    v_result.reason := 'locked';
    v_result.locked_until := v_locked_until;
    return v_result;
  end if;

  if v_hash = extensions.crypt(p_pin, v_hash) then
    update app_private.user_pin_credentials
    set failed_count = 0, locked_until = null
    where user_id = p_user_id;

    if v_auth_user_id is null then
      -- PIN correct, but this account never went through
      -- admin-provision-mobile-account, so there is no auth.users row to
      -- mint a session against. An operational gap, not a security one — but
      -- note this does reveal "the PIN was right" to whoever is holding it,
      -- which is why it's the one exception to the fully generic responses
      -- above. There is no session to steal at the end of it: the account
      -- literally cannot be signed into yet, so there is nothing this leaks
      -- that the throttle above doesn't already bound.
      v_result.ok := false;
      v_result.reason := 'not_provisioned';
      return v_result;
    end if;

    v_result.ok := true;
    v_result.auth_user_id := v_auth_user_id;
    v_result.reason := 'ok';
    return v_result;
  end if;

  v_failed := v_failed + 1;
  update app_private.user_pin_credentials
  set failed_count = v_failed,
      locked_until = case when v_failed >= 5 then v_now + interval '15 minutes' else null end
  where user_id = p_user_id;

  v_result.ok := false;
  v_result.reason := 'invalid_pin';
  if v_failed >= 5 then
    v_result.locked_until := v_now + interval '15 minutes';
  end if;
  return v_result;
end;
$$;

comment on function public.verify_pin(uuid, text) is
  'Called only by the pin-sign-in Edge Function, using the service role key. '
  'The plaintext PIN reaches this one function and goes no further: not '
  'returned, not logged, not held anywhere after the crypt() comparison '
  'completes. This is the same trust boundary every server-side credential '
  'check relies on — a server has to see a secret once to check it against a '
  'hash; that is true of a password too, not something specific to a PIN.';

-- Explicit revoke first: Postgres grants EXECUTE on a new function to PUBLIC
-- by default, and that default survives even after the schema-level
-- `alter default privileges ... revoke all on functions from anon,
-- authenticated` in migration 1 — that statement only suppresses the default
-- grant to those two named roles, not the separate, always-applied grant to
-- PUBLIC itself. public.driver_identity_images() already established this
-- belt-and-suspenders pattern in Phase 1; every function below repeats it.
revoke all on function public.verify_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_pin(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Session heartbeat
-- ---------------------------------------------------------------------------
-- Called by the mobile client after each successful action — never on a
-- plain read, so browsing alone doesn't silently keep an idle session alive.
-- Checked directly against auth.uid(), not through the idle-gated helpers
-- above: a session one second past its 30-minute window must not be
-- resurrectable, but a heartbeat that arrives one second before that window
-- closes must still succeed. Going through current_user_id() here would make
-- both impossible at once.

create or replace function public.touch_session(p_session_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.sessions s
  set last_seen_at = pg_catalog.now()
  from public.users u
  where s.id = p_session_id
    and s.user_id = u.id
    and u.auth_user_id = (select auth.uid())
    and s.revoked_at is null
    and s.expires_at > pg_catalog.now();

  return found;
end;
$$;

comment on function public.touch_session(uuid) is
  'Returns false if the session is already past its hard cap or revoked — '
  'that means a fresh PIN is required, not a silent revival.';

revoke all on function public.touch_session(uuid) from public, anon;
grant execute on function public.touch_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- PIN set / reset
-- ---------------------------------------------------------------------------
-- SPEC: Owner can reset any PIN. One function serves both the very first PIN
-- a mobile account gets and every reset after — an upsert, not two code
-- paths with the same hashing logic duplicated between them.
--
-- Checks app.is_owner() itself rather than relying only on the EXECUTE grant,
-- so the admin-provision-mobile-account Edge Function can call this using the
-- calling Owner's own forwarded session — the same enforcement point either
-- way, instead of two.

create or replace function public.admin_reset_pin(p_user_id uuid, p_new_pin text)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_role   public.user_role;
  v_status public.user_status;
  v_owner  uuid := app.current_user_id();
begin
  if not app.is_owner() then
    raise exception 'Only Owner/Admin may set or reset a PIN'
      using errcode = 'insufficient_privilege';
  end if;

  if p_new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode = 'check_violation';
  end if;

  select u.role, u.status into v_role, v_status
  from public.users u
  where u.id = p_user_id;

  if not found or v_role not in ('COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS') then
    raise exception 'Target user is not a PIN-based role' using errcode = 'check_violation';
  end if;

  insert into app_private.user_pin_credentials
    (user_id, pin_hash, failed_count, locked_until, set_by, set_at)
  values (
    p_user_id,
    extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
    0, null, v_owner, pg_catalog.now()
  )
  on conflict (user_id) do update
  set pin_hash     = excluded.pin_hash,
      failed_count = 0,
      locked_until = null,
      set_by       = excluded.set_by,
      set_at       = excluded.set_at;

  -- A reset ends every currently-live session under the old PIN. A reset
  -- usually means the PIN may be compromised or a mistake was made; either
  -- way nothing already signed in under the old credential should continue.
  update public.sessions
  set revoked_at = pg_catalog.now()
  where user_id = p_user_id
    and revoked_at is null;

  return true;
end;
$$;

comment on function public.admin_reset_pin(uuid, text) is
  'Sets or replaces a mobile role''s PIN and revokes their current sessions. '
  'Owner/Admin only, enforced inside the function body. No UI calls this yet '
  '— it is reachable today only via direct RPC or the '
  'admin-provision-mobile-account Edge Function, per SPEC''s "build the '
  'mechanism, not necessarily a UI for it yet."';

revoke all on function public.admin_reset_pin(uuid, text) from public, anon;
grant execute on function public.admin_reset_pin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Mobile roster picker
-- ---------------------------------------------------------------------------
-- A PIN alone can't say whose PIN it is — PINs are not required to be unique
-- across users, so the client needs an identifier alongside it. This is a
-- name picker rather than a memorised staff number: SPEC calls the mobile
-- workspace "large touch controls, simple," and typing a second meaningless
-- number is worse than recognising your own name in a list of two or three
-- coworkers, for no real security or offline gain — see docs/decisions/0007
-- for the full comparison.
--
-- This is the first and only EXECUTE grant to `anon` in this database. It
-- returns exactly two columns — id, display_name — for ACTIVE users of
-- exactly the two mobile roles. No phone, no email, no photo: nothing that
-- isn't already said out loud when someone hands a coworker a phone. It does
-- not touch the guarantee the guards migration actually enforces (zero
-- policies granted to anon on any table) — this was never a table grant.

create or replace function public.mobile_role_roster(p_role public.user_role)
  returns table (id uuid, display_name text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select u.id, u.display_name
  from public.users u
  where u.role = p_role
    and u.status = 'ACTIVE'
    and p_role in ('COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS');
$$;

comment on function public.mobile_role_roster(public.user_role) is
  'Anonymous-callable by design — see docs/decisions/0007. Structurally '
  'cannot return Owner/Admin or Fleet Manager rows: p_role is checked in the '
  'WHERE clause itself, not just documented.';

revoke all on function public.mobile_role_roster(public.user_role) from public;
grant execute on function public.mobile_role_roster(public.user_role) to anon, authenticated;
