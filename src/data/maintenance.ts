import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

// Screens never call Supabase directly — same convention as src/data/vehicles.ts.
// camelCase in and out; snake_case stays inside this file.

export type MaintenanceStatus = Enums<'maintenance_status'>
export type MaintenanceRecordType = Enums<'maintenance_record_type'>
export type MaintenanceHandledBy = Enums<'maintenance_handled_by'>
export type PartSource = Enums<'part_source'>
export type FilterAction = Enums<'filter_action'>
export type Roadworthiness = Enums<'roadworthiness'>
export type ProblemDescriptor = Enums<'problem_descriptor'>

/**
 * The one value the database itself constrains (see the Phase 1 migration's
 * own comment on maintenance_orders.service_area) — selecting it must set
 * both service_area and work_action to this literal string, matching
 * mo_oil_change_is_regular_service / mo_oil_change_sets_work_action exactly.
 */
export const OIL_CHANGE_SERVICE_AREA = 'OIL_CHANGE'

export interface MaintenanceOrderListItem {
  id: string
  vehicleId: string
  vehicleFleetId: string
  recordType: MaintenanceRecordType
  serviceArea: string
  status: MaintenanceStatus
  isGrounded: boolean
  identifiedOn: string
  closedAt: string | null
}

export interface MaintenanceOrderDetail {
  id: string
  vehicleId: string
  vehicleFleetId: string
  recordType: MaintenanceRecordType
  serviceArea: string
  workAction: string | null
  problemDescriptor: ProblemDescriptor | null
  status: MaintenanceStatus
  isGrounded: boolean
  safetyStatus: Roadworthiness
  identifiedOn: string
  expectedInspectionOn: string | null
  expectedCompletionOn: string | null
  estimatedGroundedDays: number | null
  handledBy: MaintenanceHandledBy | null
  oldPartsReturned: boolean | null
  reminderDate: string | null
  notes: string | null
  openedBy: string
  openedAt: string
  closedAt: string | null
  verifiedBy: string | null
}

const ORDER_COLUMNS =
  'id, vehicle_id, record_type, service_area, work_action, problem_descriptor, status, is_grounded, safety_status, identified_on, expected_inspection_on, expected_completion_on, estimated_grounded_days, handled_by, old_parts_returned, reminder_date, notes, opened_by, opened_at, closed_at, verified_by'

/** Every order, most recent first — the desktop Maintenance list. Pass
 *  `openOnly` for the mobile "Open orders" entry point, matching the
 *  partial index the table already carries for that filter. */
export async function fetchMaintenanceOrders(options?: { openOnly?: boolean }): Promise<MaintenanceOrderListItem[]> {
  let query = supabase
    .from('maintenance_orders')
    .select(`id, vehicle_id, record_type, service_area, status, is_grounded, identified_on, closed_at, vehicles!inner(fleet_id)`)
    .order('identified_on', { ascending: false })
    .limit(200)

  if (options?.openOnly) {
    query = query.is('closed_at', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleFleetId: (row.vehicles as unknown as { fleet_id: string }).fleet_id,
    recordType: row.record_type,
    serviceArea: row.service_area,
    status: row.status,
    isGrounded: row.is_grounded,
    identifiedOn: row.identified_on,
    closedAt: row.closed_at,
  }))
}

export async function fetchMaintenanceOrder(id: string): Promise<MaintenanceOrderDetail | null> {
  const { data, error } = await supabase.from('maintenance_orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null

  const { data: vehicle } = await supabase.from('vehicles').select('fleet_id').eq('id', data.vehicle_id).maybeSingle()

  return {
    id: data.id,
    vehicleId: data.vehicle_id,
    vehicleFleetId: vehicle?.fleet_id ?? '(unknown)',
    recordType: data.record_type,
    serviceArea: data.service_area,
    workAction: data.work_action,
    problemDescriptor: data.problem_descriptor,
    status: data.status,
    isGrounded: data.is_grounded,
    safetyStatus: data.safety_status,
    identifiedOn: data.identified_on,
    expectedInspectionOn: data.expected_inspection_on,
    expectedCompletionOn: data.expected_completion_on,
    estimatedGroundedDays: data.estimated_grounded_days,
    handledBy: data.handled_by,
    oldPartsReturned: data.old_parts_returned,
    reminderDate: data.reminder_date,
    notes: data.notes,
    openedBy: data.opened_by,
    openedAt: data.opened_at,
    closedAt: data.closed_at,
    verifiedBy: data.verified_by,
  }
}

export interface CreateMaintenanceOrderInput {
  vehicleId: string
  recordType: MaintenanceRecordType
  serviceArea: string
  workAction?: string
  problemDescriptor?: ProblemDescriptor
  handledBy?: MaintenanceHandledBy
  safetyStatus?: Roadworthiness
  expectedCompletionOn?: string
  estimatedGroundedDays?: number
  notes?: string
  openedBy: string
}

/** identified_on is deliberately not sent — it defaults server-side to
 *  app.freetown_today(), same rule as every other business date. */
export async function createMaintenanceOrder(input: CreateMaintenanceOrderInput): Promise<string> {
  const { data, error } = await supabase
    .from('maintenance_orders')
    .insert({
      client_record_id: crypto.randomUUID(),
      vehicle_id: input.vehicleId,
      record_type: input.recordType,
      service_area: input.serviceArea,
      work_action: input.workAction ?? null,
      problem_descriptor: input.problemDescriptor ?? null,
      handled_by: input.handledBy ?? null,
      safety_status: input.safetyStatus ?? 'UNKNOWN',
      expected_completion_on: input.expectedCompletionOn ?? null,
      estimated_grounded_days: input.estimatedGroundedDays ?? null,
      notes: input.notes ?? null,
      opened_by: input.openedBy,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export interface MaintenanceStatusEvent {
  id: string
  fromStatus: MaintenanceStatus | null
  toStatus: MaintenanceStatus
  changedBy: string
  changedAt: string
  note: string | null
}

export async function fetchMaintenanceStatusHistory(orderId: string): Promise<MaintenanceStatusEvent[]> {
  const { data, error } = await supabase
    .from('maintenance_status_events')
    .select('id, from_status, to_status, changed_by, changed_at, note')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    note: row.note,
  }))
}

/** Maintenance order status is a projection of maintenance_status_events
 *  (Phase 1) — mirrors changeVehicleStatus's shape exactly: this never
 *  writes maintenance_orders.status directly, it appends an event and the
 *  database trigger updates status/is_grounded/closed_at. */
export async function changeMaintenanceStatus(
  orderId: string,
  toStatus: MaintenanceStatus,
  changedBy: string,
  note?: string,
): Promise<void> {
  const { error } = await supabase.from('maintenance_status_events').insert({
    client_record_id: crypto.randomUUID(),
    order_id: orderId,
    to_status: toStatus,
    changed_by: changedBy,
    note: note ?? null,
  })
  if (error) throw error
}

export interface MaintenancePart {
  id: string
  partName: string
  partSource: PartSource
  filterAction: FilterAction | null
  quantity: number
  unitCostMinor: number
  enteredBy: string
  enteredAt: string
}

export async function fetchMaintenanceParts(orderId: string): Promise<MaintenancePart[]> {
  const { data, error } = await supabase
    .from('maintenance_parts')
    .select('id, part_name, part_source, filter_action, quantity, unit_cost_minor, entered_by, entered_at')
    .eq('order_id', orderId)
    .order('entered_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    partName: row.part_name,
    partSource: row.part_source,
    filterAction: row.filter_action,
    quantity: row.quantity,
    unitCostMinor: row.unit_cost_minor,
    enteredBy: row.entered_by,
    enteredAt: row.entered_at,
  }))
}

export interface RecordMaintenancePartInput {
  orderId: string
  partName: string
  partSource: PartSource
  filterAction?: FilterAction
  quantity: number
  unitCostMinor: number
}

/** Records a part and, when it cost anything, the matching PARTS ledger
 *  expense — public.record_maintenance_part(). SECURITY DEFINER, same
 *  reasoning as Phase 5's apply_daily_payment_effects fix: maintenance_parts
 *  is desktop-only to UPDATE, so the ledger_entry_id link-back needs to
 *  bypass RLS for a Maintenance & Repairs caller. Returns the new
 *  maintenance_parts id. */
export async function recordMaintenancePart(input: RecordMaintenancePartInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_maintenance_part', {
    p_client_record_id: crypto.randomUUID(),
    p_order_id: input.orderId,
    p_part_name: input.partName,
    p_part_source: input.partSource,
    p_filter_action: input.filterAction ?? 'NOT_CHANGED',
    p_quantity: input.quantity,
    p_unit_cost_minor: input.unitCostMinor,
  })
  if (error) throw error
  return data
}

export interface MaintenanceNote {
  id: string
  bodyText: string
  enteredBy: string
  enteredAt: string
}

export async function fetchMaintenanceNotes(orderId: string): Promise<MaintenanceNote[]> {
  const { data, error } = await supabase
    .from('maintenance_notes')
    .select('id, body_text, entered_by, entered_at')
    .eq('order_id', orderId)
    .order('entered_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    bodyText: row.body_text,
    enteredBy: row.entered_by,
    enteredAt: row.entered_at,
  }))
}

export async function addMaintenanceNote(orderId: string, bodyText: string, enteredBy: string): Promise<void> {
  const { error } = await supabase.from('maintenance_notes').insert({
    client_record_id: crypto.randomUUID(),
    order_id: orderId,
    body_text: bodyText,
    entered_by: enteredBy,
  })
  if (error) throw error
}

/** Desktop-only — mo_update_desktop is the only policy that grants this,
 *  same pattern as DriverProfileScreen's delete action: UI convenience,
 *  the real boundary is RLS. */
export async function toggleOldPartsReturned(orderId: string, value: boolean): Promise<void> {
  const { error } = await supabase.from('maintenance_orders').update({ old_parts_returned: value }).eq('id', orderId)
  if (error) throw error
}

export interface MaintenanceSummary {
  totalRecords: number
  vehiclesGrounded: number
  recordedCostMinor: number
  oldPartsNotReturned: number
}

/**
 * The desktop dashboard's four cards, the simple version — SPEC describes
 * "Recorded Cost" as "opening analytics ... linked to Accounting," deferred
 * to Phase 8 (see the Phase 6 plan). This is a total, not a breakdown.
 */
export async function fetchMaintenanceSummary(): Promise<MaintenanceSummary> {
  const [totalRes, groundedRes, partsRes, oldPartsRes] = await Promise.all([
    supabase.from('maintenance_orders').select('id', { count: 'exact', head: true }),
    supabase.from('maintenance_orders').select('vehicle_id').eq('is_grounded', true).is('closed_at', null),
    supabase.from('maintenance_parts').select('quantity, unit_cost_minor'),
    // Matches maintenance_orders_old_parts_idx's own filter exactly.
    supabase.from('maintenance_orders').select('id', { count: 'exact', head: true }).not('old_parts_returned', 'is', true),
  ])

  if (totalRes.error) throw totalRes.error
  if (groundedRes.error) throw groundedRes.error
  if (partsRes.error) throw partsRes.error
  if (oldPartsRes.error) throw oldPartsRes.error

  const distinctGroundedVehicles = new Set((groundedRes.data ?? []).map((r) => r.vehicle_id)).size
  const recordedCostMinor = (partsRes.data ?? []).reduce((sum, p) => sum + p.quantity * p.unit_cost_minor, 0)

  return {
    totalRecords: totalRes.count ?? 0,
    vehiclesGrounded: distinctGroundedVehicles,
    recordedCostMinor,
    oldPartsNotReturned: oldPartsRes.count ?? 0,
  }
}
