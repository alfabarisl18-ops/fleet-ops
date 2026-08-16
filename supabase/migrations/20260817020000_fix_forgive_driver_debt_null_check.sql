-- Fleet Operations SL — fix a null-unsafe role check in forgive_driver_debt
--
-- The project's own test suite (src/types/db.test.ts) caught this before it
-- shipped: `if not app.is_owner() then raise exception ... end if` is the
-- exact bug this project already fixed once before
-- (20260810010924_fix_null_unsafe_role_negation.sql) — `app.is_owner()` can
-- return NULL (an invalid or expired session), and `not null` is `null` in
-- SQL, not `true`, so the check would silently pass instead of blocking the
-- call. Fixed the same way every other role check in this codebase already
-- is: coalesce to false first.

create or replace function public.forgive_driver_debt(p_balance_id uuid, p_reason text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller    uuid := app.current_user_id();
  v_remaining bigint;
  v_driver_id uuid;
  v_vehicle_id uuid;
begin
  if not coalesce(app.is_owner(), false) then
    raise exception 'Only Owner/Admin may forgive a driver''s debt'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to forgive a debt' using errcode = 'check_violation';
  end if;

  select remaining_amount_minor, driver_id, vehicle_id
    into v_remaining, v_driver_id, v_vehicle_id
  from public.outstanding_balances
  where id = p_balance_id and status in ('OPEN', 'PARTIAL');

  if not found then
    raise exception 'Balance not found, or already closed' using errcode = 'no_data_found';
  end if;

  update public.outstanding_balances
  set status = 'WRITTEN_OFF',
      remaining_amount_minor = 0,
      closed_at = pg_catalog.now(),
      closed_by = v_caller,
      write_off_reason = btrim(p_reason)
  where id = p_balance_id;

  if v_remaining > 0 then
    insert into public.ledger_entries
      (client_record_id, direction, amount_minor, category, applies_to_date, received_at,
       entered_by_user_id, vehicle_id, driver_id, source_type, source_id, note)
    values
      (gen_random_uuid(), 'EXPENSE', v_remaining, 'OTHER_EXPENSE', app.freetown_today(), app.freetown_today(),
       v_caller, v_vehicle_id, v_driver_id, 'OUTSTANDING_BALANCE', p_balance_id, btrim(p_reason));
  end if;
end;
$$;

comment on function public.forgive_driver_debt(uuid, text) is
  'Writes off a driver''s open or partial balance and records the forgiven '
  'amount as an OTHER_EXPENSE ledger entry. Owner/Admin only, reason '
  'required, enforced inside the function body since ob_update_desktop''s '
  'own RLS is broader than this specific action.';
