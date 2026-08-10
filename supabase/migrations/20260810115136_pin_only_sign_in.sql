-- Fleet Operations SL — Phase 2 auth
-- Drops the "pick your name" step from PIN sign-in: enter role, then PIN,
-- nothing else. Two consequences of that, handled here:
--
-- 1. A PIN alone has to identify the person, so PINs must actually be
--    unique — SPEC never guaranteed that, and admin_reset_pin didn't check
--    it. Now it does: setting a PIN that collides with another active
--    mobile-role account's current PIN is rejected outright.
-- 2. The per-account throttle in public.verify_pin assumed the account was
--    already known before the PIN was checked. Trying a PIN against every
--    active account of a role to find out who it belongs to means a wrong
--    guess can no longer be blamed on one account without picking one
--    arbitrarily — which would itself leak who almost matched via response
--    differences. The throttle here is scoped to the *role* instead: one
--    shared 5-attempt/15-minute counter per mobile role, not per person.
--    That is a real, worse-than-before property — one person's mistyped
--    PIN can block a teammate's sign-in for the same 15 minutes — traded
--    for the simpler flow. public.verify_pin (per-account) is untouched and
--    still exists; nothing currently calls it, but it stays correct and
--    available if a future screen identifies the account some other way
--    first.

-- ---------------------------------------------------------------------------
-- PIN uniqueness, enforced at assignment time
-- ---------------------------------------------------------------------------
-- Hashes are salted, so two people with the same PIN get different hash
-- strings — a UNIQUE INDEX on pin_hash cannot catch this. The check has to
-- re-derive it: try the new PIN against every other active mobile-role
-- account's existing hash.

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
  if not coalesce(app.is_owner(), false) then
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

  if exists (
    select 1
    from app_private.user_pin_credentials c
    join public.users u on u.id = c.user_id
    where u.status = 'ACTIVE'
      and u.role in ('COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS')
      and u.id <> p_user_id
      and c.pin_hash = extensions.crypt(p_new_pin, c.pin_hash)
  ) then
    raise exception 'This PIN is already assigned to another active mobile-role account'
      using errcode = 'unique_violation';
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

  update public.sessions
  set revoked_at = pg_catalog.now()
  where user_id = p_user_id
    and revoked_at is null;

  return true;
end;
$$;

comment on function public.admin_reset_pin(uuid, text) is
  'Sets or replaces a mobile role''s PIN and revokes their current sessions. '
  'Rejects a PIN already held by another active mobile-role account — PIN '
  'sign-in has no separate identifier, so PINs must be unique. Owner/Admin '
  'only, enforced inside the function body.';

-- ---------------------------------------------------------------------------
-- Role-scoped throttle
-- ---------------------------------------------------------------------------

create table app_private.role_pin_throttle (
  role         public.user_role primary key
                 check (role in ('COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS')),
  failed_count integer not null default 0 check (failed_count >= 0),
  locked_until timestamptz
);

comment on table app_private.role_pin_throttle is
  'Throttle state for verify_role_pin, which is not tied to one account — a '
  'wrong guess cannot be blamed on a specific person before one is found to '
  'match. Deliberately coarser than app_private.user_pin_credentials''s '
  'per-account throttle: one shared counter per mobile role.';

-- ---------------------------------------------------------------------------
-- Role + PIN verification
-- ---------------------------------------------------------------------------

create type public.role_pin_check_result as (
  ok           boolean,
  user_id      uuid,
  auth_user_id uuid,
  locked_until timestamptz,
  reason       text  -- 'ok' | 'invalid_pin' | 'locked' | 'not_provisioned'
);

comment on type public.role_pin_check_result is
  'Same shape and same no-enumeration intent as public.pin_check_result, '
  'plus user_id — the caller does not supply one this time, so the match '
  'has to return it.';

create or replace function public.verify_role_pin(p_role public.user_role, p_pin text)
  returns public.role_pin_check_result
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_now         timestamptz := pg_catalog.now();
  v_failed      integer;
  v_locked      timestamptz;
  v_match_count integer := 0;
  v_user_id     uuid;
  v_auth_id     uuid;
  v_result      public.role_pin_check_result;
begin
  if p_role not in ('COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS') then
    v_result.ok := false;
    v_result.reason := 'invalid_pin';
    return v_result;
  end if;

  insert into app_private.role_pin_throttle (role) values (p_role)
    on conflict (role) do nothing;

  select t.failed_count, t.locked_until into v_failed, v_locked
  from app_private.role_pin_throttle t
  where t.role = p_role
  for update;

  if v_locked is not null and v_locked > v_now then
    v_result.ok := false;
    v_result.reason := 'locked';
    v_result.locked_until := v_locked;
    return v_result;
  end if;

  -- Try every active, currently-unlocked account of this role. Uniqueness is
  -- enforced at assignment time, so more than one match should never happen —
  -- if it somehow did anyway, failing closed (treating it the same as no
  -- match) is the only safe response, not guessing which one was meant.
  for v_user_id, v_auth_id in
    select u.id, u.auth_user_id
    from public.users u
    join app_private.user_pin_credentials c on c.user_id = u.id
    where u.role = p_role
      and u.status = 'ACTIVE'
      and (c.locked_until is null or c.locked_until <= v_now)
      and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
  loop
    v_match_count := v_match_count + 1;
  end loop;

  if v_match_count = 1 then
    update app_private.role_pin_throttle
    set failed_count = 0, locked_until = null
    where role = p_role;

    update app_private.user_pin_credentials
    set failed_count = 0, locked_until = null
    where user_id = v_user_id;

    if v_auth_id is null then
      v_result.ok := false;
      v_result.reason := 'not_provisioned';
      return v_result;
    end if;

    v_result.ok := true;
    v_result.user_id := v_user_id;
    v_result.auth_user_id := v_auth_id;
    v_result.reason := 'ok';
    return v_result;
  end if;

  v_failed := v_failed + 1;
  update app_private.role_pin_throttle
  set failed_count = v_failed,
      locked_until = case when v_failed >= 5 then v_now + interval '15 minutes' else null end
  where role = p_role;

  v_result.ok := false;
  v_result.reason := 'invalid_pin';
  if v_failed >= 5 then
    v_result.locked_until := v_now + interval '15 minutes';
  end if;
  return v_result;
end;
$$;

comment on function public.verify_role_pin(public.user_role, text) is
  'Called only by the pin-sign-in Edge Function, using the service role key. '
  'Same trust boundary as public.verify_pin — the plaintext PIN reaches this '
  'one function and goes no further.';

revoke all on function public.verify_role_pin(public.user_role, text) from public, anon, authenticated;
grant execute on function public.verify_role_pin(public.user_role, text) to service_role;
