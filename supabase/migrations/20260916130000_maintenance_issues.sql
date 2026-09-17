-- Expand one maintenance order from one legacy issue to an ordered issue list.
-- Legacy columns remain on maintenance_orders for a compatible rollout and
-- mirror the first issue created by the new RPC.

create table public.maintenance_issues (
  id                 uuid primary key default gen_random_uuid(),
  client_record_id   uuid not null unique default gen_random_uuid(),
  order_id           uuid not null references public.maintenance_orders (id) on delete restrict,
  position           integer not null check (position > 0),
  service_area       text not null check (length(btrim(service_area)) > 0),
  problem_descriptor public.problem_descriptor,
  work_action        text,
  created_at         timestamptz not null default now(),
  unique (order_id, position)
);

create index maintenance_issues_order_idx on public.maintenance_issues (order_id, position);

create or replace function app.validate_maintenance_issue()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_record_type public.maintenance_record_type;
begin
  select record_type into strict v_record_type
  from public.maintenance_orders
  where id = new.order_id;

  if v_record_type = 'PROBLEM_REPORTED' and new.problem_descriptor is null then
    raise exception 'Problem Reported issues require a problem descriptor'
      using errcode = 'check_violation';
  end if;

  if upper(btrim(new.service_area)) = 'OIL_CHANGE' then
    if v_record_type <> 'REGULAR_SERVICE' then
      raise exception 'Oil Change is available only under Regular Service'
        using errcode = 'check_violation';
    end if;
    if upper(btrim(coalesce(new.work_action, ''))) <> 'OIL_CHANGE' then
      raise exception 'Oil Change must use the Oil Change work action'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger maintenance_issues_validate
  before insert or update on public.maintenance_issues
  for each row execute function app.validate_maintenance_issue();

-- Preserve every historical order as one issue before new writes begin.
insert into public.maintenance_issues
  (client_record_id, order_id, position, service_area, problem_descriptor, work_action, created_at)
select
  gen_random_uuid(), id, 1, service_area, problem_descriptor, work_action, opened_at
from public.maintenance_orders;

-- Compatibility for the old deployed client during migration-first rollout.
-- The new RPC passes the device-generated first issue ID through a transaction-
-- local setting; an older direct insert receives a generated compatibility ID.
create or replace function app.maintenance_order_first_issue_after_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_client_record_id uuid;
begin
  v_client_record_id := coalesce(
    nullif(pg_catalog.current_setting('app.maintenance_first_issue_client_id', true), '')::uuid,
    gen_random_uuid()
  );

  insert into public.maintenance_issues
    (client_record_id, order_id, position, service_area, problem_descriptor, work_action, created_at)
  values
    (v_client_record_id, new.id, 1, new.service_area, new.problem_descriptor, new.work_action, new.opened_at);

  return null;
end;
$$;

create trigger maintenance_orders_first_issue_after_insert
  after insert on public.maintenance_orders
  for each row execute function app.maintenance_order_first_issue_after_insert();

alter table public.maintenance_issues enable row level security;

create policy maintenance_issues_select on public.maintenance_issues
  for select to authenticated
  using (app.is_desktop() or app.is_maintenance());

create policy maintenance_issues_insert on public.maintenance_issues
  for insert to authenticated
  with check (
    (app.is_desktop() or app.is_maintenance())
    and exists (
      select 1 from public.maintenance_orders o
      where o.id = order_id and o.opened_by = app.current_user_id()
    )
  );

create policy maintenance_issues_update_desktop on public.maintenance_issues
  for update to authenticated
  using (app.is_desktop()) with check (app.is_desktop());

grant select, insert, update on public.maintenance_issues to authenticated;

create or replace function public.create_maintenance_order(
  p_client_record_id uuid,
  p_vehicle_id uuid,
  p_record_type public.maintenance_record_type,
  p_issues jsonb,
  p_handled_by public.maintenance_handled_by,
  p_safety_status public.roadworthiness,
  p_expected_completion_on date,
  p_estimated_grounded_days integer,
  p_notes text
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_existing public.maintenance_orders%rowtype;
  v_order_id uuid;
  v_first jsonb;
  v_issue record;
  v_caller uuid := app.current_user_id();
begin
  if not (coalesce(app.is_desktop(), false) or coalesce(app.is_maintenance(), false)) then
    raise exception 'Role % cannot create maintenance records', app.current_app_role()
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing
  from public.maintenance_orders
  where client_record_id = p_client_record_id;
  if found then
    if v_existing.vehicle_id <> p_vehicle_id
       or v_existing.record_type <> p_record_type
       or (select count(*) from public.maintenance_issues where order_id = v_existing.id) <> jsonb_array_length(p_issues)
       or exists (
         select 1
         from jsonb_array_elements(p_issues) with ordinality expected(value, position)
         where not exists (
           select 1
           from public.maintenance_issues actual
           where actual.order_id = v_existing.id
             and actual.position = expected.position
             and actual.client_record_id = (expected.value ->> 'client_record_id')::uuid
             and actual.service_area = expected.value ->> 'service_area'
             and actual.problem_descriptor is not distinct from nullif(expected.value ->> 'problem_descriptor', '')::public.problem_descriptor
             and actual.work_action is not distinct from nullif(expected.value ->> 'work_action', '')
         )
       ) then
      raise exception 'client_record_id was already used for a different maintenance order'
        using errcode = 'unique_violation';
    end if;
    return v_existing.id;
  end if;

  if jsonb_typeof(p_issues) <> 'array' or jsonb_array_length(p_issues) = 0 then
    raise exception 'At least one maintenance issue is required'
      using errcode = 'check_violation';
  end if;

  v_first := p_issues -> 0;
  if nullif(btrim(coalesce(v_first ->> 'service_area', '')), '') is null then
    raise exception 'Every maintenance issue requires an area'
      using errcode = 'check_violation';
  end if;

  perform pg_catalog.set_config(
    'app.maintenance_first_issue_client_id',
    (v_first ->> 'client_record_id')::uuid::text,
    true
  );

  insert into public.maintenance_orders
    (client_record_id, vehicle_id, record_type, service_area, work_action,
     problem_descriptor, handled_by, safety_status, expected_completion_on,
     estimated_grounded_days, notes, opened_by)
  values
    (p_client_record_id, p_vehicle_id, p_record_type,
     v_first ->> 'service_area', nullif(v_first ->> 'work_action', ''),
     nullif(v_first ->> 'problem_descriptor', '')::public.problem_descriptor,
     p_handled_by, coalesce(p_safety_status, 'UNKNOWN'),
     p_expected_completion_on, p_estimated_grounded_days,
     nullif(btrim(coalesce(p_notes, '')), ''), v_caller)
  returning id into v_order_id;

  perform pg_catalog.set_config('app.maintenance_first_issue_client_id', '', true);

  for v_issue in
    select value, ordinality
    from jsonb_array_elements(p_issues) with ordinality
    where ordinality > 1
  loop
    insert into public.maintenance_issues
      (client_record_id, order_id, position, service_area, problem_descriptor, work_action)
    values
      ((v_issue.value ->> 'client_record_id')::uuid,
       v_order_id,
       v_issue.ordinality,
       v_issue.value ->> 'service_area',
       nullif(v_issue.value ->> 'problem_descriptor', '')::public.problem_descriptor,
       nullif(v_issue.value ->> 'work_action', ''));
  end loop;

  return v_order_id;
end;
$$;

comment on function public.create_maintenance_order(uuid, uuid, public.maintenance_record_type, jsonb, public.maintenance_handled_by, public.roadworthiness, date, integer, text) is
  'Atomically creates a maintenance order and its ordered issues. The first '
  'issue is mirrored into legacy singular columns for compatible deployment; '
  'client_record_id makes an offline retry return the original order.';

revoke all on function public.create_maintenance_order(uuid, uuid, public.maintenance_record_type, jsonb, public.maintenance_handled_by, public.roadworthiness, date, integer, text) from public, anon;
grant execute on function public.create_maintenance_order(uuid, uuid, public.maintenance_record_type, jsonb, public.maintenance_handled_by, public.roadworthiness, date, integer, text) to authenticated;
