-- Fleet Operations SL — Phase 9 (Offline sync)
--
-- SPEC section 8: "Two collectors recording the same vehicle-day is
-- caught by the unique index and becomes a flagged duplicate for
-- review, never a silent overwrite." daily_payment_records_vehicle_
-- service_date_key (Phase 5) already catches the collision; this
-- migration adds somewhere for the losing submission to land instead
-- of just erroring out at the client. Confirmed with the user: a
-- desktop reviewer resolves it, not the collector's own device.
--
-- vehicle_id/service_date are pulled out as real columns for listing
-- and indexing; the rest of what was submitted (day_outcome,
-- received_amount_minor, and — for a bundled payment that lost on one
-- of its constituent days — the bundle's own shape) stays as jsonb
-- rather than a wide column set, since the two call sites that can
-- collide here (record_daily_payment, record_bundled_payment) don't
-- share one payload shape.

create table public.flagged_duplicate_payments (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles (id) on delete restrict,
  service_date     date not null,
  payload          jsonb not null,
  submitted_by     uuid not null references public.users (id),
  submitted_at     timestamptz not null default now(),
  resolved_by      uuid references public.users (id),
  resolved_at      timestamptz,
  constraint fdp_resolved_pair check ((resolved_at is null) = (resolved_by is null))
);

comment on table public.flagged_duplicate_payments is
  'A daily-payment submission that lost the race on '
  'daily_payment_records_vehicle_service_date_key -- surfaced for a '
  'desktop reviewer, never silently dropped or overwritten. Open while '
  'resolved_at is null, same pattern as public.alerts -- no separate '
  'status enum needed. No merge/auto-apply action exists -- SPEC says '
  '"for review," not "for automatic reconciliation."';

create index flagged_duplicate_payments_open_idx
  on public.flagged_duplicate_payments (vehicle_id, service_date)
  where resolved_at is null;

alter table public.flagged_duplicate_payments enable row level security;

create policy fdp_select_desktop on public.flagged_duplicate_payments
  for select to authenticated using (app.is_desktop());
create policy fdp_update_desktop on public.flagged_duplicate_payments
  for update to authenticated using (app.is_desktop()) with check (app.is_desktop());

grant select, update on public.flagged_duplicate_payments to authenticated;

-- ---------------------------------------------------------------------------
-- flag_duplicate_payment -- SECURITY DEFINER: the collector (Collections
-- & Finance, a mobile role) hit the collision, but only desktop roles
-- can read/write this table (same reasoning as every other mobile-
-- writes/desktop-reads elevated-privilege function this project has
-- built). Called by the client's offline-queue flush handler when a
-- retry hits daily_payment_records_vehicle_service_date_key specifically
-- -- never for any other constraint.
-- ---------------------------------------------------------------------------

create or replace function public.flag_duplicate_payment(
  p_client_record_id uuid,
  p_vehicle_id uuid,
  p_service_date date,
  p_payload jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_id uuid;
  v_caller uuid := app.current_user_id();
begin
  if not (coalesce(app.is_collections(), false) or coalesce(app.is_desktop(), false)) then
    raise exception 'Only Collections & Finance or desktop roles may flag a duplicate payment'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.flagged_duplicate_payments
    (client_record_id, vehicle_id, service_date, payload, submitted_by)
  values
    (p_client_record_id, p_vehicle_id, p_service_date, p_payload, v_caller)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.flag_duplicate_payment(uuid, uuid, date, jsonb) is
  'Records a daily-payment submission that lost the unique-index race, '
  'for desktop review. SECURITY DEFINER -- the mobile caller can''t '
  'otherwise write a desktop-only-readable table.';

revoke all on function public.flag_duplicate_payment(uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.flag_duplicate_payment(uuid, uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- resolved_at is server-stamped, same pattern as alerts.reviewed_at
-- (Phase 7) and ledger_entries.reconciled_at (Phase 8).
-- ---------------------------------------------------------------------------

create or replace function app.stamp_flagged_duplicate_resolved_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.resolved_by is not null and old.resolved_by is null then
    new.resolved_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

create trigger flagged_duplicate_payments_stamp_resolved_at
  before update on public.flagged_duplicate_payments
  for each row execute function app.stamp_flagged_duplicate_resolved_at();
