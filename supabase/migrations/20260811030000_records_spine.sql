-- Fleet Operations SL — Phase 4 (Records spine)
--
-- Phase 1 built ledger_entries, activity_records, corrections, and
-- audit_log with their schema, RLS, and grants already in place — its own
-- comment says so: "Phase 1 creates the table and its policies. The
-- triggers that populate it from each workflow belong to Phase 4." This
-- migration is that population mechanism, plus the corrections workflow
-- (request / apply / reject) for vehicles and drivers — the only real
-- entities that exist so far. See docs/decisions/0009 for the reasoning
-- behind the correction column allow-lists and the approve+apply
-- simplification.

-- activity_records.driver_id was ON DELETE RESTRICT from Phase 1, which
-- made sense before anything populated the table. Now that every driver
-- gets a DRIVER_ADDED row referencing themselves via driver_id, RESTRICT
-- would make delete_driver() (20260811020000_delete_driver.sql) block on
-- every driver's own "added" record -- found by testing, not assumed.
-- SET NULL is also the more correct behavior on its own terms: deleting a
-- driver should detach their activity history, not erase it or block the
-- delete. The row (and its summary_text, which already names the driver)
-- stays; only the reference clears.
alter table public.activity_records
  drop constraint activity_records_driver_id_fkey,
  add constraint activity_records_driver_id_fkey
    foreign key (driver_id) references public.drivers (id) on delete set null;

-- SET NULL is implemented as an UPDATE under the hood, even when it's the
-- database's own cascade, not a client's -- and activity_records' existing
-- append-only trigger (Phase 1, no allow-list = fully frozen) blocked it
-- outright. Found by testing, not assumed. driver_id needs to be the one
-- column that's allowed to move; everything else on the row stays frozen.
drop trigger activity_records_append_only on public.activity_records;
create trigger activity_records_append_only
  before update or delete on public.activity_records
  for each row execute function app.enforce_append_only('driver_id');

-- ---------------------------------------------------------------------------
-- activity_records population — triggers, not app code. Same principle as
-- decision 0006 (status columns are trigger-maintained projections, not
-- app-code writes that can diverge): every table below already has its own
-- RLS/grants that let the acting role write their own activity_records row
-- (activity_insert_signed_in: is_signed_in() and entered_by = self), so
-- none of these need SECURITY DEFINER — they run as whichever role is
-- already performing the outer insert.
-- ---------------------------------------------------------------------------

create or replace function app.activity_after_vehicle_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'VEHICLE_ADDED', 'VEHICLE', new.id, new.id,
     coalesce(new.entered_service_on, new.purchased_on, app.freetown_today()),
     app.current_user_id(), format('Vehicle %s added', new.fleet_id));
  return null;
end;
$$;

create trigger vehicles_activity_after_insert
  after insert on public.vehicles
  for each row execute function app.activity_after_vehicle_insert();

create or replace function app.activity_after_driver_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, driver_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'DRIVER_ADDED', 'DRIVER', new.id, new.id,
     coalesce(new.started_on, app.freetown_today()),
     app.current_user_id(), format('Driver %s added', new.full_name));
  return null;
end;
$$;

create trigger drivers_activity_after_insert
  after insert on public.drivers
  for each row execute function app.activity_after_driver_insert();

create or replace function app.activity_after_vehicle_status_event()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
  -- CLAUDE.md's vocabulary rule ("Active, Grounded, In maintenance -- never
  -- the raw value") applies here same as everywhere else the status is
  -- shown -- found by testing (the first version interpolated new.to_status
  -- raw, e.g. "moved to GROUNDED").
  v_status_label text;
begin
  select fleet_id into v_fleet_id from public.vehicles where id = new.vehicle_id;
  v_status_label := case new.to_status
    when 'ACTIVE' then 'Active'
    when 'GROUNDED' then 'Grounded'
    when 'IN_MAINTENANCE' then 'In maintenance'
    when 'ARCHIVED' then 'Archived'
    else new.to_status::text
  end;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'VEHICLE_STATUS_CHANGED', 'VEHICLE', new.vehicle_id, new.vehicle_id,
     app.freetown_today(), app.current_user_id(),
     format('%s moved to %s', coalesce(v_fleet_id, '(unknown)'), v_status_label));
  return null;
end;
$$;

create trigger vehicle_status_events_activity_after_insert
  after insert on public.vehicle_status_events
  for each row execute function app.activity_after_vehicle_status_event();

create or replace function app.activity_after_driver_assignment_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
  v_driver_name text;
begin
  select fleet_id into v_fleet_id from public.vehicles where id = new.vehicle_id;
  select full_name into v_driver_name from public.drivers where id = new.driver_id;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'DRIVER_ASSIGNED', 'DRIVER_ASSIGNMENT', new.id, new.vehicle_id, new.driver_id,
     new.started_on, app.current_user_id(),
     format('%s assigned to %s', coalesce(v_driver_name, '(unknown)'), coalesce(v_fleet_id, '(unknown)')));
  return null;
end;
$$;

create trigger driver_assignments_activity_after_insert
  after insert on public.driver_assignments
  for each row execute function app.activity_after_driver_assignment_insert();

-- No amount_minor/direction here: the agreement amount is a contract value,
-- not money that moved. Real installment payments are Phase 5's ledger
-- entries — conflating the two would be exactly the kind of faked data
-- CLAUDE.md warns against.
create or replace function app.activity_after_dpa_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
  v_driver_name text;
begin
  select fleet_id into v_fleet_id from public.vehicles where id = new.vehicle_id;
  select full_name into v_driver_name from public.drivers where id = new.driver_id;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'DRIVER_PURCHASE_AGREEMENT_CREATED', 'DRIVER_PURCHASE_AGREEMENT', new.id,
     new.vehicle_id, new.driver_id, new.started_on, app.current_user_id(),
     format('Driver-purchase agreement set up for %s with %s',
       coalesce(v_fleet_id, '(unknown)'), coalesce(v_driver_name, '(unknown)')));
  return null;
end;
$$;

create trigger dpa_activity_after_insert
  after insert on public.driver_purchase_agreements
  for each row execute function app.activity_after_dpa_insert();

-- ---------------------------------------------------------------------------
-- Historical backfill. The triggers above only fire on inserts from this
-- point forward -- Phase 3 already created real vehicles, drivers, status
-- changes, assignments, and agreements before this migration existed
-- (including Phase 1's original seed data). Without this, the Records page
-- would only show activity from today onward, which isn't what "the
-- Records page shows real history on day one" (the approved Phase 4 plan)
-- actually meant.
--
-- Limitation, disclosed rather than hidden: vehicles/drivers/etc. never
-- stored who created them -- a Phase 1 schema gap, out of scope to fix
-- here -- so entered_by can't be correctly attributed for these backfilled
-- rows. It's set to the active Owner/Admin account performing this
-- migration, not the real historical actor, which is often not knowable
-- from what Phase 1 recorded. Every row from here forward has a correct,
-- real entered_by from the trigger that wrote it.
-- ---------------------------------------------------------------------------

do $$
declare
  v_backfill_actor uuid;
begin
  select id into v_backfill_actor from public.users
  where role = 'OWNER_ADMIN' and status = 'ACTIVE' order by created_at limit 1;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, applies_to_date, entered_by, summary_text)
  select gen_random_uuid(), 'VEHICLE_ADDED', 'VEHICLE', v.id, v.id,
         coalesce(v.entered_service_on, v.purchased_on, v.created_at::date),
         v_backfill_actor, format('Vehicle %s added', v.fleet_id)
  from public.vehicles v
  where not exists (
    select 1 from public.activity_records ar where ar.record_type = 'VEHICLE_ADDED' and ar.target_id = v.id
  );

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, driver_id, applies_to_date, entered_by, summary_text)
  select gen_random_uuid(), 'DRIVER_ADDED', 'DRIVER', d.id, d.id,
         coalesce(d.started_on, d.created_at::date),
         v_backfill_actor, format('Driver %s added', d.full_name)
  from public.drivers d
  where not exists (
    select 1 from public.activity_records ar where ar.record_type = 'DRIVER_ADDED' and ar.target_id = d.id
  );

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, applies_to_date, entered_by, summary_text)
  select gen_random_uuid(), 'VEHICLE_STATUS_CHANGED', 'VEHICLE', vse.vehicle_id, vse.vehicle_id,
         vse.changed_at::date, v_backfill_actor,
         format('%s moved to %s', coalesce(v.fleet_id, '(unknown)'),
           case vse.to_status
             when 'ACTIVE' then 'Active'
             when 'GROUNDED' then 'Grounded'
             when 'IN_MAINTENANCE' then 'In maintenance'
             when 'ARCHIVED' then 'Archived'
             else vse.to_status::text
           end)
  from public.vehicle_status_events vse
  join public.vehicles v on v.id = vse.vehicle_id
  where not exists (
    select 1 from public.activity_records ar
    where ar.record_type = 'VEHICLE_STATUS_CHANGED' and ar.vehicle_id = vse.vehicle_id and ar.applies_to_date = vse.changed_at::date
  );

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id, applies_to_date, entered_by, summary_text)
  select gen_random_uuid(), 'DRIVER_ASSIGNED', 'DRIVER_ASSIGNMENT', da.id, da.vehicle_id, da.driver_id,
         da.started_on, v_backfill_actor,
         format('%s assigned to %s', coalesce(d.full_name, '(unknown)'), coalesce(v.fleet_id, '(unknown)'))
  from public.driver_assignments da
  join public.vehicles v on v.id = da.vehicle_id
  join public.drivers d on d.id = da.driver_id
  where not exists (
    select 1 from public.activity_records ar where ar.record_type = 'DRIVER_ASSIGNED' and ar.target_id = da.id
  );

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id, driver_id, applies_to_date, entered_by, summary_text)
  select gen_random_uuid(), 'DRIVER_PURCHASE_AGREEMENT_CREATED', 'DRIVER_PURCHASE_AGREEMENT', dpa.id, dpa.vehicle_id, dpa.driver_id,
         dpa.started_on, v_backfill_actor,
         format('Driver-purchase agreement set up for %s with %s', coalesce(v.fleet_id, '(unknown)'), coalesce(d.full_name, '(unknown)'))
  from public.driver_purchase_agreements dpa
  join public.vehicles v on v.id = dpa.vehicle_id
  join public.drivers d on d.id = dpa.driver_id
  where not exists (
    select 1 from public.activity_records ar where ar.record_type = 'DRIVER_PURCHASE_AGREEMENT_CREATED' and ar.target_id = dpa.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrections: request (server captures "before"), apply, reject.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: reading a driver row's full column set (including the
-- two identity-image-key columns withheld from the ordinary drivers grant,
-- see decision 0004) to build before_json needs to see more than a
-- requester's own grants allow, the same reason driver_identity_images()
-- is SECURITY DEFINER. Those two columns are explicitly stripped from the
-- JSON below before it's ever stored — this function sees them, nobody
-- reading corrections.before_json afterward does.
create or replace function app.corrections_capture_before_json()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.target_table = 'VEHICLE' then
    select to_jsonb(v) - 'id' - 'client_record_id' - 'created_at' - 'archived_at' - 'photo_key'
      into new.before_json
    from public.vehicles v where v.id = new.target_id;
  elsif new.target_table = 'DRIVER' then
    select to_jsonb(d) - 'id' - 'client_record_id' - 'created_at'
                       - 'photo_key' - 'id_image_key' - 'licence_image_key'
      into new.before_json
    from public.drivers d where d.id = new.target_id;
  else
    raise exception 'Corrections are only supported for VEHICLE and DRIVER right now'
      using errcode = 'feature_not_supported';
  end if;

  if new.before_json is null then
    raise exception 'Correction target not found' using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger corrections_before_insert_capture
  before insert on public.corrections
  for each row execute function app.corrections_capture_before_json();

create or replace function app.activity_after_correction_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id,
     vehicle_id, driver_id, applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'CORRECTION_REQUESTED', new.target_table, new.target_id,
     case when new.target_table = 'VEHICLE' then new.target_id end,
     case when new.target_table = 'DRIVER' then new.target_id end,
     app.freetown_today(), app.current_user_id(),
     format('Correction requested: %s', new.reason));
  return null;
end;
$$;

create trigger corrections_activity_after_insert
  after insert on public.corrections
  for each row execute function app.activity_after_correction_insert();

-- Owner/Admin only, self-enforced (same pattern as admin_reset_pin,
-- delete_driver). Applies only the allow-listed columns present as keys in
-- after_json — explicit per-table CASE WHEN, not dynamic SQL, matching the
-- codebase's existing preference for explicit allow-lists (decision 0005)
-- over reflection. Treats "approve" and "applied" as one action rather
-- than the schema's two separate states — see decision 0009.
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
      fleet_id               = case when v_correction.after_json ? 'fleet_id' then v_correction.after_json->>'fleet_id' else v.fleet_id end
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
  'simplification and the allow-list.';

revoke all on function public.apply_correction(uuid) from public, anon;
grant execute on function public.apply_correction(uuid) to authenticated;

create or replace function public.reject_correction(p_correction_id uuid)
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
    raise exception 'Only Owner/Admin may reject a correction'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_correction from public.corrections where id = p_correction_id for update;
  if not found then
    raise exception 'Correction not found' using errcode = 'no_data_found';
  end if;
  if v_correction.status <> 'REQUESTED' then
    raise exception 'Correction is not pending' using errcode = 'check_violation';
  end if;

  update public.corrections
  set status = 'REJECTED', approved_by = v_owner
  where id = p_correction_id;

  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_owner, 'CORRECTION_REJECTED', v_correction.target_table, v_correction.target_id,
          v_correction.before_json, null);

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id,
     vehicle_id, driver_id, applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'CORRECTION_REJECTED', v_correction.target_table, v_correction.target_id,
     case when v_correction.target_table = 'VEHICLE' then v_correction.target_id end,
     case when v_correction.target_table = 'DRIVER' then v_correction.target_id end,
     app.freetown_today(), v_owner, format('Correction rejected: %s', v_correction.reason));
end;
$$;

comment on function public.reject_correction(uuid) is
  'Rejects a REQUESTED correction. Owner/Admin only, enforced inside the '
  'function body. Writes audit_log and activity_records.';

revoke all on function public.reject_correction(uuid) from public, anon;
grant execute on function public.reject_correction(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_driver(): one explicit activity_records insert, not a generic
-- delete-trigger. driver_assignments/driver_purchase_agreements cascade
-- away as part of the same delete (20260811020000_delete_driver.sql) — a
-- generic AFTER DELETE trigger on those tables would fire for every
-- cascaded row too, producing confusing "assignment removed" noise on top
-- of the one real "driver deleted" event. driver_id is left null: it has
-- its own ON DELETE RESTRICT back to drivers, so a row referencing the
-- driver being deleted, in the same delete, would block the delete outright.
-- ---------------------------------------------------------------------------

create or replace function public.delete_driver(p_driver_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_driver_name text;
  v_owner uuid := app.current_user_id();
begin
  if not coalesce(app.is_owner(), false) then
    raise exception 'Only Owner/Admin may delete a driver'
      using errcode = 'insufficient_privilege';
  end if;

  select full_name into v_driver_name from public.drivers where id = p_driver_id;

  delete from public.drivers where id = p_driver_id;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'DRIVER_DELETED', 'DRIVER', p_driver_id,
     app.freetown_today(), v_owner, format('Driver %s deleted', coalesce(v_driver_name, '(unknown)')));
end;
$$;

comment on function public.delete_driver(uuid) is
  'Deletes a driver. Cascades driver_assignments and '
  'driver_purchase_agreements (the two tables Phase 3 owns); blocked by '
  'ON DELETE RESTRICT if any other real reference exists. Owner/Admin '
  'only, enforced inside the function body -- see decision 0008. Writes '
  'one activity_records row for the deletion itself.';
