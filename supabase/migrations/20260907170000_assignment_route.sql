-- Atomic route synchronization; existing desktop RLS remains authoritative.
create or replace function public.assign_driver_to_vehicle(
  p_client_record_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_route_id uuid
)
  returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_prior_vehicle_id uuid;
begin
  if not coalesce(app.is_desktop(), false) then
    raise exception 'Only management may assign drivers' using errcode = 'insufficient_privilege';
  end if;
  -- Serialize assignment changes, including retries, before closing any history.
  perform pg_catalog.pg_advisory_xact_lock(74190321);
  select id into v_assignment_id from public.driver_assignments
  where client_record_id = p_client_record_id;
  if found then
    if not exists (select 1 from public.driver_assignments where id = v_assignment_id
      and driver_id = p_driver_id and vehicle_id = p_vehicle_id
      and route_id is not distinct from p_route_id) then
      raise exception 'Assignment retry does not match the original request' using errcode = 'check_violation';
    end if;
    return v_assignment_id;
  end if;
  -- A driver can only be actively assigned to one vehicle at a time
  -- (driver_assignments_one_open_per_driver), and a vehicle can only have
  -- one active driver (driver_assignments_one_open_per_vehicle). "Assign
  -- this driver to this vehicle" means making that true now, not rejecting
  -- the call because it was already true of something else a moment ago —
  -- so both sides' prior open assignment, if any, end today before the new
  -- one starts. If the driver is moving off a different vehicle, that
  -- vehicle's current_driver_id has to be cleared too, or it keeps
  -- pointing at a driver who has moved on.
  select vehicle_id into v_prior_vehicle_id
  from public.driver_assignments
  where driver_id = p_driver_id and ended_on is null and vehicle_id <> p_vehicle_id;

  update public.driver_assignments
  set ended_on = app.freetown_today()
  where driver_id = p_driver_id and ended_on is null;

  update public.driver_assignments
  set ended_on = app.freetown_today()
  where vehicle_id = p_vehicle_id and ended_on is null;

  insert into public.driver_assignments (client_record_id, driver_id, vehicle_id, route_id)
  values (p_client_record_id, p_driver_id, p_vehicle_id, p_route_id)
  returning id into v_assignment_id;

  update public.vehicles
  set current_driver_id = p_driver_id, route_id = p_route_id
  where id = p_vehicle_id;

  if v_prior_vehicle_id is not null then
    update public.vehicles
    set current_driver_id = null
    where id = v_prior_vehicle_id;
  end if;

  return v_assignment_id;
end;
$$;

comment on function public.assign_driver_to_vehicle(uuid, uuid, uuid, uuid) is
  'Inserts a driver_assignments row and updates the vehicle driver and route '
  'in one transaction. SECURITY INVOKER — authorization is exactly the '
  'existing RLS on both tables, not reimplemented here.';

-- New function in public defaults to EXECUTE granted to PUBLIC (the same
-- Postgres default every other function migration in this codebase has had
-- to work around — see 20260808233153_driver_identity_access.sql). Revoke
-- first, then grant to authenticated; RLS on the two tables underneath does
-- the actual desktop-only restriction.
revoke all on function public.assign_driver_to_vehicle(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_driver_to_vehicle(uuid, uuid, uuid, uuid) to authenticated;
