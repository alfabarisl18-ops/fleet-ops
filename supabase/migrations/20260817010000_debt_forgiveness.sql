-- Fleet Operations SL — Debt forgiveness (SPEC open question 7, answered)
--
-- SPEC section 10's own open question 7: "Can a driver's accumulated debt
-- be forgiven, and does that need Owner approval and a recorded reason?"
-- outstanding_balances already had a WRITTEN_OFF status (Phase 1) with no
-- path to reach it and no reason column. Confirmed with the user: Owner/Admin
-- only, a reason is required. Since forgiven money is a real loss to the
-- business, forgiving a balance also records an OTHER_EXPENSE ledger entry
-- for the amount forgiven — the same "every real money movement gets a
-- ledger entry" rule every other phase has followed, not a new one.

alter table public.outstanding_balances
  add column write_off_reason text,
  add column closed_by        uuid references public.users (id);

alter table public.outstanding_balances
  add constraint ob_write_off_reason_required
  check ((status = 'WRITTEN_OFF') = (write_off_reason is not null));

comment on column public.outstanding_balances.write_off_reason is
  'Required exactly when status = WRITTEN_OFF. Never set any other way.';
comment on column public.outstanding_balances.closed_by is
  'Who closed the balance. Only ever set by forgive_driver_debt today — the '
  'existing settle-to-CLEARED path (record_daily_payment''s overpayment '
  'handling) predates this column and does not set it, which is fine: '
  'CLEARED has no equivalent "who decided this" question the way a '
  'forgiven debt does.';

-- The append-only allow-list needs the two new columns added — same
-- mechanism as every other append-only table, just re-declared since
-- Postgres has no ALTER TRIGGER for changing a trigger's own arguments.
drop trigger outstanding_balances_append_only on public.outstanding_balances;
create trigger outstanding_balances_append_only
  before update or delete on public.outstanding_balances
  for each row execute function app.enforce_append_only(
    'remaining_amount_minor', 'promised_date', 'reminder_date', 'status',
    'closed_at', 'write_off_reason', 'closed_by');

-- ---------------------------------------------------------------------------
-- forgive_driver_debt — SECURITY DEFINER: outstanding_balances' own RLS
-- (ob_update_desktop) allows either desktop role to update it, but SPEC's
-- answer here is narrower than that — Owner/Admin only, checked inside the
-- function body the same way approve_flagged_expense (Phase 8) narrows
-- ledger_update_desktop to Fleet-Manager-only. ob_update_desktop itself is
-- untouched, so a future non-forgiveness balance edit (e.g. a reminder
-- date) still works for either desktop role exactly as before.
-- ---------------------------------------------------------------------------

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
  if not app.is_owner() then
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

revoke all on function public.forgive_driver_debt(uuid, text) from public, anon;
grant execute on function public.forgive_driver_debt(uuid, text) to authenticated;
