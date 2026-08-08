-- Fleet Operations SL — Phase 1 foundation
-- 13 · Reading a driver's ID and licence images.
--
-- SPEC section 3: "Driver ID and licence images are visible to Owner/Admin and
-- Fleet Manager only. Collections and Maintenance never see them."
--
-- The fleet migration withheld drivers.id_image_key and drivers.licence_image_key
-- from the `authenticated` role by column grant. That is the usual Postgres tool
-- for column-level security, and here it is the wrong one: all four application
-- roles authenticate as the single Postgres role `authenticated`, and the
-- application role lives in public.users. A column grant therefore cannot tell
-- Owner/Admin from a collector — it either lets all four read the column or none
-- of them. As written it denied all four, which satisfies half the requirement
-- and breaks the other half.
--
-- Row level security cannot help either: a policy filters rows, not columns.
--
-- So the two keys are read through a function that checks the application role
-- itself. It lives in `public` because that is the only schema PostgREST
-- exposes, which makes it reachable as an RPC; it is SECURITY DEFINER because
-- the caller has no privilege on those columns; and it returns nothing at all
-- to a role that should not see them.

create or replace function public.driver_identity_images(p_driver_id uuid)
  returns table (id_image_key text, licence_image_key text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.is_desktop() then
    raise exception 'Driver identity images are visible to Owner/Admin and Fleet Manager only'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select d.id_image_key, d.licence_image_key
    from public.drivers d
    where d.id = p_driver_id;
end;
$$;

comment on function public.driver_identity_images(uuid) is
  'Storage keys for a driver''s ID and licence images. Raises for Collections & '
  'Finance and for Maintenance & Repairs. The columns themselves are not granted '
  'to any client role, so this is the only route to them.';

revoke all on function public.driver_identity_images(uuid) from public, anon;
grant execute on function public.driver_identity_images(uuid) to authenticated;

-- The same rule applied to the file itself, rather than the key, already works
-- as a row policy on public.documents: DRIVER_ID and DRIVER_LICENCE rows are
-- invisible to both mobile roles. These two columns and that table are the only
-- two ways to reach an identity image, and both are now closed.
