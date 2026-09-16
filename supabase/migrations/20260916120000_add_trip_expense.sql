-- Append a missing direct cost to an existing trip without rewriting history.
-- The caller supplies only the cost fact; vehicle, driver and business dates
-- are copied from the authoritative trip on the server.

create or replace function public.add_trip_expense(
  p_client_record_id uuid,
  p_trip_id uuid,
  p_category public.ledger_category,
  p_amount_minor bigint,
  p_note text default null
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_existing public.ledger_entries%rowtype;
  v_trip public.trips%rowtype;
  v_entry_id uuid;
  v_caller uuid := app.current_user_id();
begin
  if not coalesce(app.is_desktop(), false) then
    raise exception 'Only Owner/Admin or Fleet Manager may add a missing trip cost'
      using errcode = 'insufficient_privilege';
  end if;

  if p_category not in ('FUEL', 'ROAD_CHECKPOINT', 'DRIVER_OR_HELPER_PAYMENT') then
    raise exception 'Invalid trip expense category: %', p_category
      using errcode = 'check_violation';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Trip expense amount must be greater than zero'
      using errcode = 'check_violation';
  end if;

  select * into v_existing
  from public.ledger_entries
  where client_record_id = p_client_record_id;

  if found then
    if v_existing.direction <> 'EXPENSE'
       or v_existing.source_type <> 'TRIP'
       or v_existing.source_id <> p_trip_id
       or v_existing.category <> p_category
       or v_existing.amount_minor <> p_amount_minor then
      raise exception 'client_record_id was already used for a different trip expense'
        using errcode = 'unique_violation';
    end if;
    return v_existing.id;
  end if;

  select * into strict v_trip
  from public.trips
  where id = p_trip_id;

  insert into public.ledger_entries
    (client_record_id, direction, amount_minor, category, applies_to_date,
     received_at, entered_by_user_id, vehicle_id, driver_id, source_type,
     source_id, note)
  values
    (p_client_record_id, 'EXPENSE', p_amount_minor, p_category,
     v_trip.departed_on, app.freetown_today(), v_caller, v_trip.vehicle_id,
     v_trip.driver_id, 'TRIP', v_trip.id, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

comment on function public.add_trip_expense(uuid, uuid, public.ledger_category, bigint, text) is
  'Owner/Admin and Fleet Manager append a missing direct trip cost. The function '
  'is idempotent by client_record_id, derives trip context and Freetown dates on '
  'the server, and never updates an existing ledger row.';

revoke all on function public.add_trip_expense(uuid, uuid, public.ledger_category, bigint, text) from public, anon;
grant execute on function public.add_trip_expense(uuid, uuid, public.ledger_category, bigint, text) to authenticated;
