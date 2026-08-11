-- Fleet Operations SL — Phase 3 (Vehicles and Drivers)
-- Owner/Admin can delete a driver at any time, with a confirm step in the
-- UI. Most concretely: a driver added by mistake who never actually went
-- into service.
--
-- This amends SPEC.md's and this migration's own original comment ("a
-- driver is never deleted — status moves to FORMER"). See
-- docs/decisions/0008-driver-delete-cascades-only-its-own-two-tables.md
-- for the full reasoning; the short version:
--
-- 11 tables reference drivers.id. Deleting a driver only cascades the two
-- Phase 3 itself owns and writes to today — driver_assignments and
-- driver_purchase_agreements. Real data loss there, by explicit,
-- explained choice. The other 9 references (outstanding_balances,
-- ledger_entries, daily_payment_records, activity_records,
-- bundled_payments, driver_credits, trips, alerts, and the polymorphic
-- documents.owner_id) are deliberately left untouched — they belong to
-- phases that don't exist yet and are always empty today, so this has no
-- practical effect yet. Their existing ON DELETE RESTRICT keeps doing its
-- job automatically once a later phase starts writing real rows: deleting
-- a driver with real payment/trip/maintenance history will correctly
-- start failing again, with no code change needed here.

alter table public.driver_assignments
  drop constraint driver_assignments_driver_id_fkey,
  add constraint driver_assignments_driver_id_fkey
    foreign key (driver_id) references public.drivers (id) on delete cascade;

alter table public.driver_purchase_agreements
  drop constraint driver_purchase_agreements_driver_id_fkey,
  add constraint driver_purchase_agreements_driver_id_fkey
    foreign key (driver_id) references public.drivers (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- public.delete_driver
-- ---------------------------------------------------------------------------

create or replace function public.delete_driver(p_driver_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not coalesce(app.is_owner(), false) then
    raise exception 'Only Owner/Admin may delete a driver'
      using errcode = 'insufficient_privilege';
  end if;

  -- driver_assignments and driver_purchase_agreements rows cascade
  -- automatically (see the two ALTER TABLEs above). Any other real
  -- reference — nothing today, possibly something once a later phase
  -- exists — still blocks via its own ON DELETE RESTRICT and surfaces as
  -- a plain foreign_key_violation.
  delete from public.drivers where id = p_driver_id;
end;
$$;

comment on function public.delete_driver(uuid) is
  'Deletes a driver. Cascades driver_assignments and '
  'driver_purchase_agreements (the two tables Phase 3 owns); blocked by '
  'ON DELETE RESTRICT if any other real reference exists. Owner/Admin '
  'only, enforced inside the function body — see decision 0008.';

revoke all on function public.delete_driver(uuid) from public, anon;
grant execute on function public.delete_driver(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- public.driver_delete_preview
-- ---------------------------------------------------------------------------
-- Read-only, informational only — not a gate. Powers the confirmation
-- dialog's wording so "delete" never asks a bare "are you sure" with no
-- specifics about what else disappears.

create or replace function public.driver_delete_preview(p_driver_id uuid)
  returns table (assignment_count int, agreement_count int)
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select
    (select count(*)::int from public.driver_assignments where driver_id = p_driver_id),
    (select count(*)::int from public.driver_purchase_agreements where driver_id = p_driver_id)
  where coalesce(app.is_owner(), false);
$$;

comment on function public.driver_delete_preview(uuid) is
  'Counts of driver_assignments/driver_purchase_agreements rows a delete '
  'would cascade, for the confirmation dialog. Owner/Admin only — returns '
  'no rows for anyone else, matching delete_driver''s own restriction.';

revoke all on function public.driver_delete_preview(uuid) from public, anon;
grant execute on function public.driver_delete_preview(uuid) to authenticated;
