-- Fleet Operations SL — explicit role checks on the two new agreement RPCs
--
-- complete_driver_purchase_agreement / cancel_driver_purchase_agreement
-- relied on RLS alone (dpa_update_desktop) to block a non-desktop caller —
-- correct, but silently affects zero rows rather than raising a clear
-- error, unlike every sibling function in this codebase
-- (override_shortfall_treatment, forgive_driver_debt) which checks the
-- role explicitly in the function body too. Matching that precedent —
-- and coalescing to false from the start this time, not repeating the
-- null-unsafe mistake the project's own test suite already caught once
-- this week.

create or replace function public.complete_driver_purchase_agreement(p_agreement_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_caller uuid := app.current_user_id();
  v_vehicle_id uuid;
  v_status public.ownership_transfer_status;
begin
  if not coalesce(app.is_desktop(), false) then
    raise exception 'Only Owner/Admin or Fleet Manager may complete a driver-purchase agreement'
      using errcode = 'insufficient_privilege';
  end if;

  select vehicle_id, ownership_transfer_status into v_vehicle_id, v_status
  from public.driver_purchase_agreements
  where id = p_agreement_id;

  if not found then
    raise exception 'Agreement not found' using errcode = 'no_data_found';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'This agreement is already completed' using errcode = 'check_violation';
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'A cancelled agreement cannot be completed' using errcode = 'check_violation';
  end if;

  update public.driver_purchase_agreements
  set ownership_transfer_status = 'COMPLETED',
      completed_by = v_caller,
      completed_at = pg_catalog.now()
  where id = p_agreement_id;

  insert into public.vehicle_status_events (client_record_id, vehicle_id, to_status, changed_by, reason)
  values (gen_random_uuid(), v_vehicle_id, 'ARCHIVED', v_caller,
          'Driver-purchase agreement completed — ownership transferred to the driver');
end;
$$;

create or replace function public.cancel_driver_purchase_agreement(p_agreement_id uuid, p_reason text)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_status public.ownership_transfer_status;
begin
  if not coalesce(app.is_desktop(), false) then
    raise exception 'Only Owner/Admin or Fleet Manager may cancel a driver-purchase agreement'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to cancel an agreement' using errcode = 'check_violation';
  end if;

  select ownership_transfer_status into v_status
  from public.driver_purchase_agreements
  where id = p_agreement_id;

  if not found then
    raise exception 'Agreement not found' using errcode = 'no_data_found';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'A completed agreement cannot be cancelled' using errcode = 'check_violation';
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'This agreement is already cancelled' using errcode = 'check_violation';
  end if;

  update public.driver_purchase_agreements
  set ownership_transfer_status = 'CANCELLED',
      cancelled_by = app.current_user_id(),
      cancelled_at = pg_catalog.now(),
      cancellation_reason = btrim(p_reason)
  where id = p_agreement_id;
end;
$$;
