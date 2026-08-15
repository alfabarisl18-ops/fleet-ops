import { supabase } from '@/lib/supabase'
import type { WriteOutcome } from '@/lib/offlineQueue'
import { withOfflineQueue } from '@/lib/offlineQueue'
import type { LedgerDirection } from '@/data/activityRecords'
import type { LedgerCategory } from '@/data/dailyPayments'
import type { Json } from '@/types/database'
import type { Enums } from '@/types/db'
import { rpcArgs } from '@/types/db'

// Screens never call Supabase directly — same convention as src/data/vehicles.ts.
// camelCase in and out; snake_case stays inside this file.
//
// This is the first phase to ever read ledger_entries in aggregate — every
// prior phase only wrote individual rows to it (record_daily_payment,
// record_bundled_payment, recordOtherPayment, record_maintenance_part).

export type ApprovalStatus = Enums<'approval_status'>
export type TripStatus = Enums<'trip_status'>
export type WeightUnit = Enums<'weight_unit'>

/** Africa/Freetown "today", already fetched elsewhere in the app
 *  (src/data/dailyPayments.ts) — reused here rather than duplicated. */
async function freetownToday(): Promise<string> {
  const { data, error } = await supabase.rpc('freetown_today')
  if (error) throw error
  return data
}

function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`
}

export interface LedgerSummary {
  incomeMinor: number
  expenseMinor: number
  profitLossMinor: number
}

/** Defaults to the current month when no range is given. */
export async function fetchLedgerSummary(fromDate?: string, toDate?: string): Promise<LedgerSummary> {
  const today = await freetownToday()
  const from = fromDate ?? monthStart(today)
  const to = toDate ?? today

  const { data, error } = await supabase
    .from('ledger_entries')
    .select('direction, amount_minor')
    .gte('applies_to_date', from)
    .lte('applies_to_date', to)
    .is('superseded_by_id', null)

  if (error) throw error

  let incomeMinor = 0
  let expenseMinor = 0
  for (const row of data ?? []) {
    if (row.direction === 'INCOME') incomeMinor += row.amount_minor
    else expenseMinor += row.amount_minor
  }
  return { incomeMinor, expenseMinor, profitLossMinor: incomeMinor - expenseMinor }
}

export interface TransactionListItem {
  id: string
  direction: LedgerDirection
  amountMinor: number
  category: LedgerCategory
  appliesToDate: string
  vehicleId: string | null
  vehicleFleetId: string | null
  approvalStatus: ApprovalStatus
  reconciledAt: string | null
  note: string | null
}

/** Recent transactions — the smaller half of SPEC's "split the ledger area
 *  in two" (the other half is fetchLedgerSummary). */
export async function fetchRecentTransactions(limit = 20): Promise<TransactionListItem[]> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('id, direction, amount_minor, category, applies_to_date, vehicle_id, approval_status, reconciled_at, note, vehicles(fleet_id)')
    .is('superseded_by_id', null)
    .order('applies_to_date', { ascending: false })
    .order('entered_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction,
    amountMinor: row.amount_minor,
    category: row.category,
    appliesToDate: row.applies_to_date,
    vehicleId: row.vehicle_id,
    vehicleFleetId: (row.vehicles as unknown as { fleet_id: string } | null)?.fleet_id ?? null,
    approvalStatus: row.approval_status,
    reconciledAt: row.reconciled_at,
    note: row.note,
  }))
}

/** Entries whose approval_status needs a decision — the Approvals queue. */
export async function fetchPendingApprovals(): Promise<TransactionListItem[]> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('id, direction, amount_minor, category, applies_to_date, vehicle_id, approval_status, reconciled_at, note, vehicles(fleet_id)')
    .in('approval_status', ['PENDING', 'DISPUTED'])
    .is('superseded_by_id', null)
    .order('applies_to_date', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction,
    amountMinor: row.amount_minor,
    category: row.category,
    appliesToDate: row.applies_to_date,
    vehicleId: row.vehicle_id,
    vehicleFleetId: (row.vehicles as unknown as { fleet_id: string } | null)?.fleet_id ?? null,
    approvalStatus: row.approval_status,
    reconciledAt: row.reconciled_at,
    note: row.note,
  }))
}

export interface SprinterIncomeRow {
  vehicleId: string
  fleetId: string
  expectedMinor: number
  collectedMinor: number
  missingMinor: number
  owedByDriverMinor: number
}

/** "Sprinter Income" — every non-box-truck vehicle (SPEC names Sprinters
 *  specifically, but the same day_outcome model covers tricycles/buses/
 *  garbage trucks too — isDayOutcomeEligible is the one existing rule for
 *  which vehicles this is, reused rather than re-invented). */
export async function fetchSprinterIncome(fromDate?: string, toDate?: string): Promise<SprinterIncomeRow[]> {
  const today = await freetownToday()
  const from = fromDate ?? monthStart(today)
  const to = toDate ?? today

  const [{ data: vehicles, error: vError }, { data: payments, error: pError }, { data: balances, error: bError }] = await Promise.all([
    supabase.from('vehicles').select('id, fleet_id, current_driver_id').neq('type', 'BOX_TRUCK').neq('status', 'ARCHIVED'),
    supabase.from('daily_payment_records').select('vehicle_id, expected_amount_minor, received_amount_minor').gte('service_date', from).lte('service_date', to),
    supabase.from('outstanding_balances').select('driver_id, remaining_amount_minor').in('status', ['OPEN', 'PARTIAL']),
  ])
  if (vError) throw vError
  if (pError) throw pError
  if (bError) throw bError

  const owedByDriver = new Map<string, number>()
  for (const b of balances ?? []) {
    owedByDriver.set(b.driver_id, (owedByDriver.get(b.driver_id) ?? 0) + b.remaining_amount_minor)
  }

  return (vehicles ?? []).map((v) => {
    const rows = (payments ?? []).filter((p) => p.vehicle_id === v.id)
    const expectedMinor = rows.reduce((sum, r) => sum + r.expected_amount_minor, 0)
    const collectedMinor = rows.reduce((sum, r) => sum + r.received_amount_minor, 0)
    return {
      vehicleId: v.id,
      fleetId: v.fleet_id,
      expectedMinor,
      collectedMinor,
      missingMinor: Math.max(expectedMinor - collectedMinor, 0),
      owedByDriverMinor: v.current_driver_id ? (owedByDriver.get(v.current_driver_id) ?? 0) : 0,
    }
  })
}

export interface TripListItem {
  id: string
  vehicleId: string
  fleetId: string
  departedOn: string | null
  returnedOn: string | null
  pickupLocation: string | null
  destinationLocation: string | null
  status: TripStatus
  revenueMinor: number
  expenseMinor: number
  netMinor: number
}

/** "Truck Income" — every box truck's trips with their net, computed the
 *  same way as the vehicle profile per SPEC: revenue minus linked
 *  expenses, never stored. */
export async function fetchTruckIncome(): Promise<TripListItem[]> {
  const { data: trips, error: tError } = await supabase
    .from('trips')
    .select('id, vehicle_id, departed_on, returned_on, pickup_location, destination_location, status, vehicles(fleet_id)')
    .order('departed_on', { ascending: false })
  if (tError) throw tError

  const tripIds = (trips ?? []).map((t) => t.id)
  if (tripIds.length === 0) return []

  const { data: entries, error: eError } = await supabase
    .from('ledger_entries')
    .select('direction, amount_minor, source_id')
    .eq('source_type', 'TRIP')
    .in('source_id', tripIds)
    .is('superseded_by_id', null)
  if (eError) throw eError

  return (trips ?? []).map((t) => {
    const rows = (entries ?? []).filter((e) => e.source_id === t.id)
    const revenueMinor = rows.filter((e) => e.direction === 'INCOME').reduce((sum, e) => sum + e.amount_minor, 0)
    const expenseMinor = rows.filter((e) => e.direction === 'EXPENSE').reduce((sum, e) => sum + e.amount_minor, 0)
    return {
      id: t.id,
      vehicleId: t.vehicle_id,
      fleetId: (t.vehicles as unknown as { fleet_id: string } | null)?.fleet_id ?? '(unknown)',
      departedOn: t.departed_on,
      returnedOn: t.returned_on,
      pickupLocation: t.pickup_location,
      destinationLocation: t.destination_location,
      status: t.status,
      revenueMinor,
      expenseMinor,
      netMinor: revenueMinor - expenseMinor,
    }
  })
}

export interface KnownExpenseRow {
  category: LedgerCategory
  totalMinor: number
}

/** "Known Expenses" — grouped by category, current month by default. */
export async function fetchKnownExpenses(fromDate?: string, toDate?: string): Promise<KnownExpenseRow[]> {
  const today = await freetownToday()
  const from = fromDate ?? monthStart(today)
  const to = toDate ?? today

  const { data, error } = await supabase
    .from('ledger_entries')
    .select('category, amount_minor')
    .eq('direction', 'EXPENSE')
    .gte('applies_to_date', from)
    .lte('applies_to_date', to)
    .is('superseded_by_id', null)
  if (error) throw error

  const totals = new Map<LedgerCategory, number>()
  for (const row of data ?? []) {
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount_minor)
  }
  return [...totals.entries()]
    .map(([category, totalMinor]) => ({ category, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor)
}

/** Money owed TO the business — open/partial driver balances. */
export async function fetchOwedToBusiness(): Promise<number> {
  const { data, error } = await supabase.from('outstanding_balances').select('remaining_amount_minor').in('status', ['OPEN', 'PARTIAL'])
  if (error) throw error
  return (data ?? []).reduce((sum, r) => sum + r.remaining_amount_minor, 0)
}

/** Money owed BY the business — driver credits not yet consumed (an
 *  overpayment held as a future-payment liability). */
export async function fetchOwedByBusiness(): Promise<number> {
  const { data, error } = await supabase.from('driver_credits').select('remaining_minor').gt('remaining_minor', 0)
  if (error) throw error
  return (data ?? []).reduce((sum, r) => sum + r.remaining_minor, 0)
}

export async function fetchUnreconciledCount(): Promise<number> {
  const { count, error } = await supabase.from('ledger_entries').select('id', { count: 'exact', head: true }).is('reconciled_at', null).is('superseded_by_id', null)
  if (error) throw error
  return count ?? 0
}

/** Entered on a later calendar day than the business date it applies to. */
export async function fetchBackdatedCount(): Promise<number> {
  const { data, error } = await supabase.from('ledger_entries').select('applies_to_date, entered_at').is('superseded_by_id', null)
  if (error) throw error
  return (data ?? []).filter((r) => r.applies_to_date < r.entered_at.slice(0, 10)).length
}

export interface VehicleTargetProgress {
  vehicleId: string
  fleetId: string
  yearlyTargetMinor: number
  yearToDateMinor: number
}

/** Calendar-year-to-date INCOME vs. yearly_target_minor — the same window
 *  app.evaluate_scheduled_alerts() uses for VEHICLE_BELOW_TARGET. */
export async function fetchVehicleTargetProgress(): Promise<VehicleTargetProgress[]> {
  const today = await freetownToday()
  const yearStart = `${today.slice(0, 4)}-01-01`

  const [{ data: vehicles, error: vError }, { data: entries, error: eError }] = await Promise.all([
    supabase.from('vehicles').select('id, fleet_id, yearly_target_minor').neq('status', 'ARCHIVED').gt('yearly_target_minor', 0),
    supabase.from('ledger_entries').select('vehicle_id, amount_minor').eq('direction', 'INCOME').gte('applies_to_date', yearStart).lte('applies_to_date', today).is('superseded_by_id', null),
  ])
  if (vError) throw vError
  if (eError) throw eError

  return (vehicles ?? []).map((v) => ({
    vehicleId: v.id,
    fleetId: v.fleet_id,
    yearlyTargetMinor: v.yearly_target_minor,
    yearToDateMinor: (entries ?? []).filter((e) => e.vehicle_id === v.id).reduce((sum, e) => sum + e.amount_minor, 0),
  }))
}

// --- Write actions ----------------------------------------------------------

export interface RecordTripInput {
  vehicleId: string
  driverId?: string
  helperName?: string
  pickupLocation?: string
  destinationLocation?: string
  departedOn: string
  returnedOn?: string
  loadQuantity?: number
  loadWeight?: number
  loadWeightUnit?: WeightUnit
  notes?: string
  revenueMinor: number
  expenses?: { category: 'ROAD_CHECKPOINT' | 'DRIVER_OR_HELPER_PAYMENT' | 'FUEL'; amountMinor: number; note?: string }[]
}

type RecordTripPayload = RecordTripInput & { clientRecordId: string }

async function recordTripLive(payload: RecordTripPayload): Promise<string> {
  const { data, error } = await supabase.rpc(
    'record_trip',
    rpcArgs<'record_trip'>({
      p_client_record_id: payload.clientRecordId,
      p_vehicle_id: payload.vehicleId,
      p_driver_id: payload.driverId ?? null,
      p_helper_name: payload.helperName ?? null,
      p_pickup_location: payload.pickupLocation ?? null,
      p_destination_location: payload.destinationLocation ?? null,
      p_departed_on: payload.departedOn,
      p_returned_on: payload.returnedOn ?? null,
      p_load_quantity: payload.loadQuantity ?? null,
      p_load_weight: payload.loadWeight ?? null,
      p_load_weight_unit: payload.loadWeightUnit ?? null,
      p_notes: payload.notes ?? null,
      p_revenue_minor: payload.revenueMinor,
      p_expenses: (payload.expenses ?? []).map((e) => ({ category: e.category, amount_minor: e.amountMinor, note: e.note ?? null })),
    }),
  )
  if (error) throw error
  return data
}

/** Mobile entry point per SPEC: Collections & Finance, under Sprinter &
 *  Box-Truck Payment -> box truck selected. Also reachable from desktop.
 *  Offline-queue-aware (Phase 9). */
export async function recordTrip(input: RecordTripInput): Promise<WriteOutcome<string>> {
  const payload: RecordTripPayload = { ...input, clientRecordId: crypto.randomUUID() }
  return withOfflineQueue('recordTrip', payload.clientRecordId, payload, () => recordTripLive(payload))
}

/** For the offline-queue replay handler only — src/lib/offlineQueueReplay.ts. */
export async function replayRecordTrip(payload: unknown): Promise<string> {
  return recordTripLive(payload as RecordTripPayload)
}

/** Desktop-only — a reviewer flags a transaction after entry (SPEC's own
 *  wording implies review happens on the transactions view, not at
 *  entry time). */
export async function flagLedgerEntry(ledgerEntryId: string, status: 'PENDING' | 'DISPUTED'): Promise<void> {
  const { error } = await supabase.rpc('flag_ledger_entry', { p_ledger_entry_id: ledgerEntryId, p_status: status })
  if (error) throw error
}

/** Fleet Manager only, enforced inside the function body — SPEC taken
 *  literally: "Only unusual or disputed expenses require Fleet Manager
 *  approval." */
export async function approveFlaggedExpense(ledgerEntryId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_flagged_expense', { p_ledger_entry_id: ledgerEntryId })
  if (error) throw error
}

/** Desktop-only via ledger_update_desktop — a plain update, matching how
 *  Phase 1 already built reconciled_at/reconciled_by as the one mutable
 *  pair meant for exactly this. reconciled_at is server-stamped by a
 *  trigger the first time reconciled_by is set — never derived from the
 *  client's clock, same pattern as alerts.reviewed_at (Phase 7). */
export async function reconcileLedgerEntry(ledgerEntryId: string, currentUserId: string): Promise<void> {
  const { error } = await supabase.from('ledger_entries').update({ reconciled_by: currentUserId }).eq('id', ledgerEntryId)
  if (error) throw error
}

/** Desktop-only via vehicles_update_desktop. Closes the gap
 *  yearly_target_minor had no edit path at all (excluded from the
 *  vehicle correction allow-list, decision 0009). */
export async function updateVehicleTarget(vehicleId: string, yearlyTargetMinor: number): Promise<void> {
  const { error } = await supabase.from('vehicles').update({ yearly_target_minor: yearlyTargetMinor }).eq('id', vehicleId)
  if (error) throw error
}

/**
 * Phase 9 (Offline sync): called by the queue flush handler, never
 * directly by a screen, when a queued recordDailyPayment collides with
 * daily_payment_records_vehicle_service_date_key on retry — SPEC:
 * "becomes a flagged duplicate for review, never a silent overwrite."
 * SECURITY DEFINER RPC — Collections & Finance can't otherwise write a
 * desktop-only-readable table.
 */
export async function flagDuplicatePayment(vehicleId: string, serviceDate: string, payload: unknown): Promise<string> {
  const { data, error } = await supabase.rpc('flag_duplicate_payment', {
    p_client_record_id: crypto.randomUUID(),
    p_vehicle_id: vehicleId,
    p_service_date: serviceDate,
    p_payload: payload as Json,
  })
  if (error) throw error
  return data
}

export interface FlaggedDuplicatePayment {
  id: string
  vehicleId: string
  vehicleFleetId: string
  serviceDate: string
  payload: unknown
  submittedAt: string
}

/** Desktop-only via fdp_select_desktop. */
export async function fetchFlaggedDuplicatePayments(): Promise<FlaggedDuplicatePayment[]> {
  const { data, error } = await supabase
    .from('flagged_duplicate_payments')
    .select('id, vehicle_id, service_date, payload, submitted_at, vehicles(fleet_id)')
    .is('resolved_at', null)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleFleetId: (row.vehicles as unknown as { fleet_id: string } | null)?.fleet_id ?? '(unknown)',
    serviceDate: row.service_date,
    payload: row.payload,
    submittedAt: row.submitted_at,
  }))
}

/** Desktop-only via fdp_update_desktop. SPEC says "for review," not "for
 *  automatic reconciliation" — this only dismisses the flag, it never
 *  merges or replays the losing submission. */
export async function resolveFlaggedDuplicatePayment(id: string, currentUserId: string): Promise<void> {
  const { error } = await supabase.from('flagged_duplicate_payments').update({ resolved_by: currentUserId }).eq('id', id)
  if (error) throw error
}
