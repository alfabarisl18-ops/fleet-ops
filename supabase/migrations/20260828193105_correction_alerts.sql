-- Fleet Operations SL
-- CORRECTION_REQUESTED: raised when someone who isn't Owner/Admin requests
-- a correction, resolved once it's approved or rejected. Same event-driven
-- shape as VEHICLE_GROUNDED/BALANCE_OUTSTANDING (Phase 7) and
-- VEHICLE_BELOW_TARGET (Phase 8) — a plain AFTER trigger either side, no
-- cron involvement (decision 0012's "ask trigger-vs-cron fresh per type" —
-- a correction request has one clear triggering event, not a date-driven
-- condition).
--
-- Subject reuses VEHICLE/DRIVER — corrections.target_table is already one
-- of those two entity_type values, and subject_id = target_id is exactly
-- how VEHICLE_BELOW_TARGET (Phase 8) already points an alert at a vehicle.
-- No new entity_type value needed.
--
-- SECURITY DEFINER, matching every other alerts-writing trigger in this
-- codebase: a non-desktop requester can't otherwise insert into alerts,
-- which is desktop-only via alerts_insert_desktop.

create or replace function app.alerts_after_correction_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- Owner/Admin's own request is auto-applied a moment later by the client
  -- (CorrectionPanel's self-edit collapse) — it would never be genuinely
  -- pending long enough for an alert to mean anything, so skip it rather
  -- than raise-then-instantly-resolve noise.
  if exists (
    select 1 from public.users u where u.id = new.requested_by and u.role = 'OWNER_ADMIN'
  ) then
    return null;
  end if;

  insert into public.alerts
    (client_record_id, type, severity, subject_type, subject_id, vehicle_id, driver_id, visible_to_roles)
  values
    (gen_random_uuid(), 'CORRECTION_REQUESTED', 'NORMAL', new.target_table, new.target_id,
     case when new.target_table = 'VEHICLE' then new.target_id end,
     case when new.target_table = 'DRIVER' then new.target_id end,
     array['OWNER_ADMIN']::public.user_role[])
  on conflict (type, subject_type, subject_id) where resolved_at is null do nothing;

  return null;
end;
$$;

create trigger corrections_alerts_after_insert
  after insert on public.corrections
  for each row execute function app.alerts_after_correction_insert();

-- reviewed/resolved by whoever actually approved or rejected it —
-- app.current_user_id() reads auth.uid() from the request JWT itself,
-- unaffected by this function's own SECURITY DEFINER escalation, so it
-- correctly captures the real Owner/Admin caller even though
-- apply_correction()/reject_correction() are themselves SECURITY DEFINER.
create or replace function app.alerts_after_correction_status_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.status = old.status then
    return null;
  end if;

  update public.alerts
  set resolved_at = pg_catalog.now(), resolved_by = app.current_user_id()
  where type = 'CORRECTION_REQUESTED' and subject_type = new.target_table and subject_id = new.target_id
    and resolved_at is null;

  return null;
end;
$$;

create trigger corrections_alerts_after_status_change
  after update of status on public.corrections
  for each row execute function app.alerts_after_correction_status_change();
