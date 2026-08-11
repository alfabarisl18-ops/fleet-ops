-- Fleet Operations SL — Phase 6 (Maintenance)
--
-- Phase 1 built maintenance_orders / maintenance_status_events /
-- maintenance_parts / maintenance_notes with schema, the status-projection
-- trigger (maintenance_status_event_after -> maintenance_orders.status,
-- line-for-line the vehicle_status_events pattern), RLS, and grants
-- already in place. Nothing has ever written to them. This migration adds
-- the one new function this phase needs and wires all four tables into
-- Phase 4/5's activity_records spine.

-- ---------------------------------------------------------------------------
-- public.record_maintenance_part — SECURITY DEFINER from the start.
-- maintenance_parts has mp_update_desktop (desktop-only UPDATE), so a
-- plain SECURITY INVOKER link-back of ledger_entry_id would silently
-- affect zero rows for a Maintenance & Repairs submission -- the exact
-- bug Phase 5 found and fixed for daily_payment_records. Self-enforces
-- the same condition mp_insert's own policy expresses, since DEFINER
-- bypasses RLS and nothing else will check it here.
-- ---------------------------------------------------------------------------

create or replace function public.record_maintenance_part(
  p_client_record_id uuid,
  p_order_id uuid,
  p_part_name text,
  p_part_source public.part_source,
  p_filter_action public.filter_action,
  p_quantity integer,
  p_unit_cost_minor bigint
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_id uuid;
  v_caller uuid := app.current_user_id();
  v_total bigint;
  v_ledger_entry_id uuid;
  v_vehicle_id uuid;
  v_driver_id uuid;
begin
  if not (coalesce(app.is_desktop(), false) or coalesce(app.is_maintenance(), false)) then
    raise exception 'Only desktop roles or Maintenance & Repairs may record a part'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.maintenance_parts
    (client_record_id, order_id, part_name, part_source, filter_action, quantity, unit_cost_minor, entered_by)
  values
    (p_client_record_id, p_order_id, p_part_name, p_part_source, p_filter_action, p_quantity, p_unit_cost_minor, v_caller)
  returning id into v_id;

  v_total := p_quantity * p_unit_cost_minor;

  if v_total > 0 then
    select o.vehicle_id, v.current_driver_id into v_vehicle_id, v_driver_id
    from public.maintenance_orders o
    join public.vehicles v on v.id = o.vehicle_id
    where o.id = p_order_id;

    insert into public.ledger_entries
      (client_record_id, direction, amount_minor, category, applies_to_date, received_at,
       entered_by_user_id, vehicle_id, driver_id, source_type, source_id)
    values
      (gen_random_uuid(), 'EXPENSE', v_total, 'PARTS', app.freetown_today(), app.freetown_today(),
       v_caller, v_vehicle_id, v_driver_id, 'MAINTENANCE_PART', v_id)
    returning id into v_ledger_entry_id;

    update public.maintenance_parts set ledger_entry_id = v_ledger_entry_id where id = v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.record_maintenance_part(uuid, uuid, text, public.part_source, public.filter_action, integer, bigint) is
  'Records a part against a maintenance order and, when it cost anything, '
  'the matching PARTS ledger expense, linked back. SECURITY DEFINER because '
  'maintenance_parts is desktop-only to UPDATE -- self-enforces the same '
  'condition mp_insert''s own RLS policy expresses.';

revoke all on function public.record_maintenance_part(uuid, uuid, text, public.part_source, public.filter_action, integer, bigint) from public, anon;
grant execute on function public.record_maintenance_part(uuid, uuid, text, public.part_source, public.filter_action, integer, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Records-spine integration -- extends the Phase 4/5 pattern. Plain
-- triggers throughout: activity_insert_signed_in already lets whichever
-- role performs the outer insert write their own row, same reasoning as
-- every trigger added in those phases.
-- ---------------------------------------------------------------------------

create or replace function app.activity_after_maintenance_order_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
  v_record_type_label text;
begin
  select fleet_id into v_fleet_id from public.vehicles where id = new.vehicle_id;

  v_record_type_label := case new.record_type
    when 'PROBLEM_REPORTED' then 'Problem reported'
    when 'REGULAR_SERVICE' then 'Regular service'
    when 'REPAIR' then 'Repair'
    else new.record_type::text
  end;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'MAINTENANCE_ORDER_OPENED', 'MAINTENANCE_ORDER', new.id, new.vehicle_id,
     new.identified_on, new.opened_by,
     format('%s — %s', coalesce(v_fleet_id, '(unknown)'), v_record_type_label));
  return null;
end;
$$;

create trigger maintenance_orders_activity_after_insert
  after insert on public.maintenance_orders
  for each row execute function app.activity_after_maintenance_order_insert();

-- Additive to maintenance_status_events' own maintenance_status_event_after
-- projection trigger, not a replacement for it.
create or replace function app.activity_after_maintenance_status_event_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
  v_vehicle_id uuid;
  v_status_label text;
begin
  select o.vehicle_id, v.fleet_id into v_vehicle_id, v_fleet_id
  from public.maintenance_orders o
  join public.vehicles v on v.id = o.vehicle_id
  where o.id = new.order_id;

  v_status_label := case new.to_status
    when 'PROBLEM_REPORTED' then 'Problem reported'
    when 'INSPECTION_PENDING' then 'Inspection pending'
    when 'REPAIR_AUTHORIZED' then 'Repair authorized'
    when 'REPAIR_IN_PROGRESS' then 'Repair in progress'
    when 'STILL_GROUNDED' then 'Still grounded'
    when 'RETURNED_TO_SERVICE' then 'Active/returned to service'
    when 'ADDITIONAL_PROBLEM_FOUND' then 'Additional problem found'
    when 'COMPLETED_AND_VERIFIED' then 'Completed and verified'
    else new.to_status::text
  end;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'MAINTENANCE_STATUS_CHANGED', 'MAINTENANCE_ORDER', new.order_id, v_vehicle_id,
     app.freetown_today(), new.changed_by,
     format('%s — %s', coalesce(v_fleet_id, '(unknown)'), v_status_label));
  return null;
end;
$$;

create trigger maintenance_status_events_activity_after_insert
  after insert on public.maintenance_status_events
  for each row execute function app.activity_after_maintenance_status_event_insert();

create or replace function app.activity_after_maintenance_part_insert()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_fleet_id text;
  v_vehicle_id uuid;
begin
  select o.vehicle_id, v.fleet_id into v_vehicle_id, v_fleet_id
  from public.maintenance_orders o
  join public.vehicles v on v.id = o.vehicle_id
  where o.id = new.order_id;

  insert into public.activity_records
    (client_record_id, record_type, target_type, target_id, vehicle_id,
     applies_to_date, entered_by, summary_text)
  values
    (gen_random_uuid(), 'MAINTENANCE_PART_ADDED', 'MAINTENANCE_PART', new.id, v_vehicle_id,
     app.freetown_today(), new.entered_by,
     format('%s added to %s', new.part_name, coalesce(v_fleet_id, '(unknown)')));
  return null;
end;
$$;

create trigger maintenance_parts_activity_after_insert
  after insert on public.maintenance_parts
  for each row execute function app.activity_after_maintenance_part_insert();
