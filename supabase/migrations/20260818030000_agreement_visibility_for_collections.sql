-- Fleet Operations SL — let mobile roles know a vehicle has an active
-- driver-purchase agreement, without granting them SELECT on
-- driver_purchase_agreements itself.
--
-- Bug found live: driver_purchase_agreements has only dpa_select_desktop
-- (Owner/Admin or Fleet Manager) as a SELECT policy. Collections & Finance
-- has none, so VehiclePaymentScreen's fetchOpenAgreementForVehicle call
-- silently returns nothing for that role — the mobile "this shortfall
-- becomes debt regardless of outcome" warning never shows, even when an
-- agreement is genuinely active. The agreement's amount, driver, and terms
-- are still desktop-only; this exposes nothing but the one yes/no fact the
-- collector's screen needs to be honest.

create or replace function public.vehicle_has_active_purchase_agreement(p_vehicle_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from public.driver_purchase_agreements
    where vehicle_id = p_vehicle_id and ownership_transfer_status <> 'CANCELLED'
  );
$$;

comment on function public.vehicle_has_active_purchase_agreement(uuid) is
  'Whether a vehicle has a non-cancelled driver-purchase agreement -- the '
  'same "open agreement" definition used by app.daily_payment_before_insert() '
  'and app.apply_daily_payment_effects(). SECURITY DEFINER so Collections & '
  'Finance can check this one fact without a broader SELECT grant on '
  'driver_purchase_agreements, which stays desktop-only.';

revoke all on function public.vehicle_has_active_purchase_agreement(uuid) from public, anon;
grant execute on function public.vehicle_has_active_purchase_agreement(uuid) to authenticated;
