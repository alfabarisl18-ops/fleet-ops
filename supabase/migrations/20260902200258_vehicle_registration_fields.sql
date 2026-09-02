-- Fleet Operations SL
-- Adds 5 columns to vehicles for data printed on a Sierra Leone Vehicle
-- Registration Card that has never had a home on this table: VIN, engine
-- number, cubic capacity, seat count, registration category (C3/D1/E3-
-- style). Deliberately excludes owner name/address (not needed).
--
-- Existing purchase_goals/transit_records already carry a similar set of
-- fields for vehicles still moving through the Future-Purchases pipeline
-- (onboard_vehicle()'s own comment explains why those never get copied
-- onto vehicles — avoiding a duplicate source of truth). This migration
-- is for vehicles added directly (AddVehicleForm), which had nowhere to
-- put this data at all.
--
-- engine_number is text, not integer — registration cards show both
-- purely numeric (112, 616) and alphanumeric (210D, 602147891) values.
-- registration_category is free text rather than a new enum — Sierra
-- Leone's DVLA category codes aren't exhaustively known (only C3/D1/E3
-- seen so far), and a free column avoids a migration every time a new
-- one shows up.

alter table public.vehicles
  add column vin text,
  add column engine_number text,
  add column cubic_capacity_cc integer,
  add column seat_count integer,
  add column registration_category text;

alter table public.vehicles
  add constraint vehicles_cubic_capacity_cc_check check (cubic_capacity_cc is null or cubic_capacity_cc > 0),
  add constraint vehicles_seat_count_check check (seat_count is null or seat_count >= 0);

-- apply_correction() needs the same 5 columns added to its VEHICLE
-- allow-list, or a correction to one of them would silently no-op. This
-- is the complete function body from 20260811030000_records_spine.sql
-- (lines 348-425), unchanged except for the 5 new SET clause lines added
-- to the VEHICLE branch (vin, engine_number, cubic_capacity_cc,
-- seat_count, registration_category) — every other line, including the
-- exception messages, errcodes, audit_log and activity_records inserts,
-- is copied verbatim, not rewritten from memory.
create or replace function public.apply_correction(p_correction_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_correction public.corrections%rowtype;
  v_owner uuid := app.current_user_id();
begin
  if not coalesce(app.is_owner(), false) then
    raise exception 'Only Owner/Admin may approve a correction'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_correction from public.corrections where id = p_correction_id for update;
  if not found then
    raise exception 'Correction not found' using errcode = 'no_data_found';
  end if;
  if v_correction.status <> 'REQUESTED' then
    raise exception 'Correction is not pending' using errcode = 'check_violation';
  end if;

  if v_correction.target_table = 'VEHICLE' then
    update public.vehicles v set
      plate                  = case when v_correction.after_json ? 'plate' then v_correction.after_json->>'plate' else v.plate end,
      color                  = case when v_correction.after_json ? 'color' then v_correction.after_json->>'color' else v.color end,
      distinguishing_marks   = case when v_correction.after_json ? 'distinguishing_marks' then v_correction.after_json->>'distinguishing_marks' else v.distinguishing_marks end,
      custom_type            = case when v_correction.after_json ? 'custom_type' then v_correction.after_json->>'custom_type' else v.custom_type end,
      custom_description     = case when v_correction.after_json ? 'custom_description' then v_correction.after_json->>'custom_description' else v.custom_description end,
      route_id               = case when v_correction.after_json ? 'route_id' then nullif(v_correction.after_json->>'route_id', '')::uuid else v.route_id end,
      purchased_on           = case when v_correction.after_json ? 'purchased_on' then nullif(v_correction.after_json->>'purchased_on', '')::date else v.purchased_on end,
      purchase_price_minor   = case when v_correction.after_json ? 'purchase_price_minor' then nullif(v_correction.after_json->>'purchase_price_minor', '')::bigint else v.purchase_price_minor end,
      entered_service_on     = case when v_correction.after_json ? 'entered_service_on' then nullif(v_correction.after_json->>'entered_service_on', '')::date else v.entered_service_on end,
      expected_retirement_on = case when v_correction.after_json ? 'expected_retirement_on' then nullif(v_correction.after_json->>'expected_retirement_on', '')::date else v.expected_retirement_on end,
      fleet_id               = case when v_correction.after_json ? 'fleet_id' then v_correction.after_json->>'fleet_id' else v.fleet_id end,
      vin                    = case when v_correction.after_json ? 'vin' then v_correction.after_json->>'vin' else v.vin end,
      engine_number          = case when v_correction.after_json ? 'engine_number' then v_correction.after_json->>'engine_number' else v.engine_number end,
      cubic_capacity_cc      = case when v_correction.after_json ? 'cubic_capacity_cc' then nullif(v_correction.after_json->>'cubic_capacity_cc', '')::integer else v.cubic_capacity_cc end,
      seat_count             = case when v_correction.after_json ? 'seat_count' then nullif(v_correction.after_json->>'seat_count', '')::integer else v.seat_count end,
      registration_category  = case when v_correction.after_json ? 'registration_category' then v_correction.after_json->>'registration_category' else v.registration_category end
    where v.id = v_correction.target_id;
  elsif v_correction.target_table = 'DRIVER' then
    update public.drivers d set
      full_name          = case when v_correction.after_json ? 'full_name' then v_correction.after_json->>'full_name' else d.full_name end,
      known_as           = case when v_correction.after_json ? 'known_as' then v_correction.after_json->>'known_as' else d.known_as end,
      phone              = case when v_correction.after_json ? 'phone' then v_correction.after_json->>'phone' else d.phone end,
      phone_alt          = case when v_correction.after_json ? 'phone_alt' then v_correction.after_json->>'phone_alt' else d.phone_alt end,
      address            = case when v_correction.after_json ? 'address' then v_correction.after_json->>'address' else d.address end,
      next_of_kin_name   = case when v_correction.after_json ? 'next_of_kin_name' then v_correction.after_json->>'next_of_kin_name' else d.next_of_kin_name end,
      next_of_kin_phone  = case when v_correction.after_json ? 'next_of_kin_phone' then v_correction.after_json->>'next_of_kin_phone' else d.next_of_kin_phone end,
      id_document_type   = case when v_correction.after_json ? 'id_document_type' then v_correction.after_json->>'id_document_type' else d.id_document_type end,
      id_document_number = case when v_correction.after_json ? 'id_document_number' then v_correction.after_json->>'id_document_number' else d.id_document_number end,
      licence_number     = case when v_correction.after_json ? 'licence_number' then v_correction.after_json->>'licence_number' else d.licence_number end,
      licence_expiry     = case when v_correction.after_json ? 'licence_expiry' then nullif(v_correction.after_json->>'licence_expiry', '')::date else d.licence_expiry end,
      started_on         = case when v_correction.after_json ? 'started_on' then nullif(v_correction.after_json->>'started_on', '')::date else d.started_on end,
      notes              = case when v_correction.after_json ? 'notes' then v_correction.after_json->>'notes' else d.notes end
    where d.id = v_correction.target_id;
  else
    raise exception 'Corrections are only supported for VEHICLE and DRIVER right now'
      using errcode = 'feature_not_supported';
  end if;

  update public.corrections
  set status = 'APPLIED', approved_by = v_owner, applied_at = pg_catalog.now()
  where id = p_correction_id;

  -- The only way audit_log ever gets a row: no client role has INSERT on
  -- it at all, by design ("written by the server only").
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_owner, 'CORRECTION_APPLIED', v_correction.target_table, v_correction.target_id,
          v_correction.before_json, v_correction.after_json);

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id,
     vehicle_id, driver_id, applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'CORRECTION_APPLIED', v_correction.target_table, v_correction.target_id,
     case when v_correction.target_table = 'VEHICLE' then v_correction.target_id end,
     case when v_correction.target_table = 'DRIVER' then v_correction.target_id end,
     app.freetown_today(), v_owner, format('Correction applied: %s', v_correction.reason));
end;
$$;

comment on function public.apply_correction(uuid) is
  'Applies a REQUESTED correction to the target vehicle or driver, using '
  'only the allow-listed columns present in after_json. Owner/Admin only, '
  'enforced inside the function body. Writes audit_log and '
  'activity_records. See decision 0009 for the approve+apply '
  'simplification and the allow-list. Vehicle allow-list extended '
  '2026-09-02 to include vin, engine_number, cubic_capacity_cc, '
  'seat_count, registration_category.';
