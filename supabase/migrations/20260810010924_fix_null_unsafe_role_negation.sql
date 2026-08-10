-- Fleet Operations SL — Phase 2 auth
-- Security fix: `IF NOT app.is_X() THEN raise` does not do what it looks
-- like it does.
--
-- app.is_owner() / app.is_desktop() / app.is_collections() / app.is_maintenance()
-- return NULL, not false, for any caller app.current_app_role() cannot
-- resolve — which includes not just "not signed in" but, as of the PIN
-- migration just before this one, a mobile role whose session has gone idle.
-- NOT NULL is NULL in SQL's three-valued logic, and PL/pgSQL's
-- `IF <null> THEN ... END IF;` treats a null condition the same as false: the
-- branch is skipped. Written as a guard clause — `IF NOT authorized() THEN
-- raise; END IF;` — that means an unresolvable caller doesn't hit the raise
-- and falls through as though the check had passed.
--
-- Found by testing the PIN-sign-in throttle code in the previous migration,
-- which used this exact shape in public.admin_reset_pin — testing it against
-- an unrecognized caller showed the reset succeeding when it should have
-- been rejected. The same shape already existed in Phase 1, in
-- public.driver_identity_images(): confirmed directly against the hosted
-- project that a syntactically valid but unresolvable JWT (any token whose
-- subject matches no ACTIVE public.users row — a stale token is enough, no
-- special privilege required) could call it and receive a real driver's ID
-- and licence document storage keys, the exact data SPEC restricts to
-- Owner/Admin and Fleet Manager. That has been true since Phase 1 was
-- merged to main; this migration closes it.
--
-- The fix is the same everywhere it appears: coalesce the role check to
-- false before negating it, so an unresolvable caller is unambiguously
-- treated as "not authorized" rather than "unknown, therefore let through".
-- No other change to any of the three functions below.

create or replace function public.driver_identity_images(p_driver_id uuid)
  returns table (id_image_key text, licence_image_key text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not coalesce(app.is_desktop(), false) then
    raise exception 'Driver identity images are visible to Owner/Admin and Fleet Manager only'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select d.id_image_key, d.licence_image_key
    from public.drivers d
    where d.id = p_driver_id;
end;
$$;

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

  -- Not currently reachable by an unresolved caller in practice — the INSERT
  -- policy on daily_payment_records already requires is_desktop() or
  -- is_collections() to be true before this trigger ever runs, which means
  -- current_app_role() is already resolved by the time execution gets here.
  -- Fixed anyway: correct by construction beats correct by coincidence of
  -- which policy happens to gate the caller today.
  if new.expected_amount_minor is null or not coalesce(app.is_desktop(), false) then
    new.expected_amount_minor := coalesce(vehicle_target, 0);
  end if;

  if new.driver_id is null then
    new.driver_id := vehicle_driver;
  end if;

  new.entered_at := pg_catalog.now();

  return new;
end;
$$;
