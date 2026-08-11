import { supabase } from '@/lib/supabase'
import { rpcArgs } from '@/types/db'
import type { Enums, RpcArgs } from '@/types/db'

export type DriverStatus = Enums<'driver_status'>

export interface DriverListItem {
  id: string
  fullName: string
  knownAs: string | null
  status: DriverStatus
}

export interface DriverSummary {
  active: number
  former: number
}

export interface DriverDetail {
  id: string
  fullName: string
  knownAs: string | null
  phone: string | null
  phoneAlt: string | null
  address: string | null
  nextOfKinName: string | null
  nextOfKinPhone: string | null
  idDocumentType: string | null
  idDocumentNumber: string | null
  licenceNumber: string | null
  licenceExpiry: string | null
  startedOn: string | null
  leftOn: string | null
  leaveReason: string | null
  status: DriverStatus
  notes: string | null
}

export interface AssignmentHistoryItem {
  id: string
  vehicleId: string
  vehicleFleetId: string
  routeName: string | null
  startedOn: string
  endedOn: string | null
}

// Phase 1: "queries against drivers must list columns explicitly. select('*')
// will fail" — id_image_key/licence_image_key are withheld from this grant on
// purpose (Owner/Admin and Fleet Manager only, via driver_identity_images()),
// and that RPC has no caller yet — photo/ID-image upload is out of scope this
// phase, so there is nothing to preview even for the two roles allowed to.
const DRIVER_COLUMNS =
  'id, full_name, known_as, phone, phone_alt, address, next_of_kin_name, next_of_kin_phone, id_document_type, id_document_number, licence_number, licence_expiry, started_on, left_on, leave_reason, status, notes'

export async function fetchDrivers(): Promise<DriverListItem[]> {
  const { data, error } = await supabase.from('drivers').select('id, full_name, known_as, status').order('full_name')
  if (error) throw error
  return (data ?? []).map((d) => ({ id: d.id, fullName: d.full_name, knownAs: d.known_as, status: d.status }))
}

export function summarizeDrivers(drivers: DriverListItem[]): DriverSummary {
  return {
    active: drivers.filter((d) => d.status === 'ACTIVE').length,
    former: drivers.filter((d) => d.status === 'FORMER').length,
  }
}

export async function fetchDriver(id: string): Promise<DriverDetail | null> {
  const { data, error } = await supabase.from('drivers').select(DRIVER_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    fullName: data.full_name,
    knownAs: data.known_as,
    phone: data.phone,
    phoneAlt: data.phone_alt,
    address: data.address,
    nextOfKinName: data.next_of_kin_name,
    nextOfKinPhone: data.next_of_kin_phone,
    idDocumentType: data.id_document_type,
    idDocumentNumber: data.id_document_number,
    licenceNumber: data.licence_number,
    licenceExpiry: data.licence_expiry,
    startedOn: data.started_on,
    leftOn: data.left_on,
    leaveReason: data.leave_reason,
    status: data.status,
    notes: data.notes,
  }
}

export async function fetchAssignmentHistory(driverId: string): Promise<AssignmentHistoryItem[]> {
  const { data, error } = await supabase
    .from('driver_assignments')
    .select('id, vehicle_id, route_id, started_on, ended_on')
    .eq('driver_id', driverId)
    .order('started_on', { ascending: false })

  if (error) throw error
  if (!data || data.length === 0) return []

  const vehicleIds = [...new Set(data.map((a) => a.vehicle_id))]
  const { data: vehicles } = await supabase.from('vehicles').select('id, fleet_id').in('id', vehicleIds)
  const fleetIdByVehicle = new Map((vehicles ?? []).map((v) => [v.id, v.fleet_id]))

  const routeIds = [...new Set(data.map((a) => a.route_id).filter((id): id is string => id !== null))]
  const routeNameById = new Map<string, string>()
  if (routeIds.length > 0) {
    const { data: routes } = await supabase.from('routes').select('id, name').in('id', routeIds)
    for (const r of routes ?? []) routeNameById.set(r.id, r.name)
  }

  return data.map((a) => ({
    id: a.id,
    vehicleId: a.vehicle_id,
    vehicleFleetId: fleetIdByVehicle.get(a.vehicle_id) ?? '(unknown)',
    routeName: a.route_id ? (routeNameById.get(a.route_id) ?? null) : null,
    startedOn: a.started_on,
    endedOn: a.ended_on,
  }))
}

export interface DriverMoneySummary {
  totalOwedMinor: number
  overdueCount: number
}

/**
 * Real queries against outstanding_balances (Phase 1 schema), legitimately
 * all-zero until Phase 5 starts writing shortfalls to it — nothing here is
 * faked to look populated. "Overdue" compares promised_date against today;
 * today comes from public.freetown_today() (server-side, Africa/Freetown),
 * never new Date() on the client, per CLAUDE.md.
 */
export async function fetchDriverMoneySummary(): Promise<DriverMoneySummary> {
  const { data: today, error: todayError } = await supabase.rpc('freetown_today')
  if (todayError) throw todayError

  const { data, error } = await supabase
    .from('outstanding_balances')
    .select('driver_id, remaining_amount_minor, promised_date')
    .in('status', ['OPEN', 'PARTIAL'])

  if (error) throw error

  const totalOwedMinor = (data ?? []).reduce((sum, row) => sum + row.remaining_amount_minor, 0)
  const overdueDrivers = new Set(
    (data ?? []).filter((row) => row.promised_date !== null && row.promised_date < today).map((row) => row.driver_id),
  )

  return { totalOwedMinor, overdueCount: overdueDrivers.size }
}

/** A single driver's current amount owed — sum of open/partial balances. */
export async function fetchOutstandingBalanceForDriver(driverId: string): Promise<number> {
  const { data, error } = await supabase
    .from('outstanding_balances')
    .select('remaining_amount_minor')
    .eq('driver_id', driverId)
    .in('status', ['OPEN', 'PARTIAL'])

  if (error) throw error
  return (data ?? []).reduce((sum, row) => sum + row.remaining_amount_minor, 0)
}

export interface CreateDriverInput {
  fullName: string
  knownAs?: string
  phone?: string
  phoneAlt?: string
  address?: string
  nextOfKinName?: string
  nextOfKinPhone?: string
  idDocumentType?: string
  idDocumentNumber?: string
  licenceNumber?: string
  licenceExpiry?: string
  startedOn?: string
  notes?: string
}

export async function createDriver(input: CreateDriverInput): Promise<string> {
  const { data, error } = await supabase
    .from('drivers')
    .insert({
      client_record_id: crypto.randomUUID(),
      full_name: input.fullName,
      known_as: input.knownAs ?? null,
      phone: input.phone ?? null,
      phone_alt: input.phoneAlt ?? null,
      address: input.address ?? null,
      next_of_kin_name: input.nextOfKinName ?? null,
      next_of_kin_phone: input.nextOfKinPhone ?? null,
      id_document_type: input.idDocumentType ?? null,
      id_document_number: input.idDocumentNumber ?? null,
      licence_number: input.licenceNumber ?? null,
      licence_expiry: input.licenceExpiry ?? null,
      started_on: input.startedOn ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

/**
 * Inserts the assignment and updates vehicles.current_driver_id together.
 * Unlike vehicle status (a trigger-maintained projection of
 * vehicle_status_events), current_driver_id is a plain column the
 * application keeps in sync — confirmed against Phase 1's own seed script,
 * which does the same two writes by hand. Goes through the
 * assign_driver_to_vehicle() RPC so both writes commit or fail together,
 * rather than two separate client-side calls that could partially fail.
 */
export async function assignDriverToVehicle(
  driverId: string,
  vehicleId: string,
  routeId: string | null,
): Promise<void> {
  const args: RpcArgs<'assign_driver_to_vehicle'> = {
    p_client_record_id: crypto.randomUUID(),
    p_driver_id: driverId,
    p_vehicle_id: vehicleId,
    p_route_id: routeId,
  }
  const { error } = await supabase.rpc('assign_driver_to_vehicle', rpcArgs(args))
  if (error) throw error
}
