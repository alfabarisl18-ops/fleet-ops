import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

// Screens never call Supabase directly — same convention as src/data/auth.ts.
// camelCase in and out; snake_case stays inside this file.

export type VehicleType = Enums<'vehicle_type'>
export type VehicleStatus = Enums<'vehicle_status'>

export interface VehicleListItem {
  id: string
  fleetId: string
  plate: string | null
  type: VehicleType
  status: VehicleStatus
}

export interface VehicleSummary {
  total: number
  active: number
  grounded: number
  inMaintenance: number
}

export interface VehicleDetail {
  id: string
  fleetId: string
  plate: string | null
  type: VehicleType
  customType: string | null
  customDescription: string | null
  color: string | null
  distinguishingMarks: string | null
  routeId: string | null
  routeName: string | null
  currentDriverId: string | null
  currentDriverName: string | null
  currentDriverPhone: string | null
  purchasedOn: string | null
  purchasePriceMinor: number | null
  enteredServiceOn: string | null
  status: VehicleStatus
  expectedDailyAmountMinor: number
  yearlyTargetMinor: number
  expectedRetirementOn: string | null
}

export interface RouteOption {
  id: string
  name: string
}

export async function fetchVehicles(): Promise<VehicleListItem[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, fleet_id, plate, type, status')
    .neq('status', 'ARCHIVED')
    .order('fleet_id')

  if (error) throw error
  return (data ?? []).map((v) => ({
    id: v.id,
    fleetId: v.fleet_id,
    plate: v.plate,
    type: v.type,
    status: v.status,
  }))
}

export function summarizeVehicles(vehicles: VehicleListItem[]): VehicleSummary {
  return {
    total: vehicles.length,
    active: vehicles.filter((v) => v.status === 'ACTIVE').length,
    grounded: vehicles.filter((v) => v.status === 'GROUNDED').length,
    inMaintenance: vehicles.filter((v) => v.status === 'IN_MAINTENANCE').length,
  }
}

/**
 * Route and current-driver names are fetched as separate small queries
 * rather than a PostgREST embed — supabase-js's generated embed types are
 * easy to get subtly wrong, and a single vehicle profile is not a hot path
 * where the extra round trips matter. `drivers` also has a column-restricted
 * SELECT grant (Phase 1), so `select('*')` on it would fail regardless —
 * this stays explicit about exactly which driver columns it needs.
 */
export async function fetchVehicle(id: string): Promise<VehicleDetail | null> {
  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .select(
      'id, fleet_id, plate, type, custom_type, custom_description, color, distinguishing_marks, route_id, current_driver_id, purchased_on, purchase_price_minor, entered_service_on, status, expected_daily_amount_minor, yearly_target_minor, expected_retirement_on',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!vehicle) return null

  let routeName: string | null = null
  if (vehicle.route_id) {
    const { data: route } = await supabase.from('routes').select('name').eq('id', vehicle.route_id).maybeSingle()
    routeName = route?.name ?? null
  }

  let currentDriverName: string | null = null
  let currentDriverPhone: string | null = null
  if (vehicle.current_driver_id) {
    const { data: driver } = await supabase
      .from('drivers')
      .select('full_name, phone')
      .eq('id', vehicle.current_driver_id)
      .maybeSingle()
    currentDriverName = driver?.full_name ?? null
    currentDriverPhone = driver?.phone ?? null
  }

  return {
    id: vehicle.id,
    fleetId: vehicle.fleet_id,
    plate: vehicle.plate,
    type: vehicle.type,
    customType: vehicle.custom_type,
    customDescription: vehicle.custom_description,
    color: vehicle.color,
    distinguishingMarks: vehicle.distinguishing_marks,
    routeId: vehicle.route_id,
    routeName,
    currentDriverId: vehicle.current_driver_id,
    currentDriverName,
    currentDriverPhone,
    purchasedOn: vehicle.purchased_on,
    purchasePriceMinor: vehicle.purchase_price_minor,
    enteredServiceOn: vehicle.entered_service_on,
    status: vehicle.status,
    expectedDailyAmountMinor: vehicle.expected_daily_amount_minor,
    yearlyTargetMinor: vehicle.yearly_target_minor,
    expectedRetirementOn: vehicle.expected_retirement_on,
  }
}

export async function fetchRoutes(): Promise<RouteOption[]> {
  const { data, error } = await supabase.from('routes').select('id, name').eq('active', true).order('name')
  if (error) throw error
  return data ?? []
}

export interface CreateVehicleInput {
  fleetId: string
  plate?: string
  type: VehicleType
  customType?: string
  customDescription?: string
  color?: string
  distinguishingMarks?: string
  routeId?: string
  purchasedOn?: string
  purchasePriceMinor?: number
  enteredServiceOn?: string
}

export async function createVehicle(input: CreateVehicleInput): Promise<string> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      client_record_id: crypto.randomUUID(),
      fleet_id: input.fleetId,
      plate: input.plate ?? null,
      type: input.type,
      custom_type: input.customType ?? null,
      custom_description: input.customDescription ?? null,
      color: input.color ?? null,
      distinguishing_marks: input.distinguishingMarks ?? null,
      route_id: input.routeId ?? null,
      purchased_on: input.purchasedOn ?? null,
      purchase_price_minor: input.purchasePriceMinor ?? null,
      entered_service_on: input.enteredServiceOn ?? null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

/**
 * Vehicle status is a projection of vehicle_status_events (Phase 1) — this
 * never writes vehicles.status directly, it appends an event and the
 * database trigger updates the column.
 */
export async function changeVehicleStatus(
  vehicleId: string,
  toStatus: VehicleStatus,
  reason: string,
  currentUserId: string,
): Promise<void> {
  const { error } = await supabase.from('vehicle_status_events').insert({
    client_record_id: crypto.randomUUID(),
    vehicle_id: vehicleId,
    to_status: toStatus,
    changed_by: currentUserId,
    reason,
  })
  if (error) throw error
}
