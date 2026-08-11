import { supabase } from '@/lib/supabase'
import type { LedgerDirection } from '@/data/activityRecords'
import type { Enums } from '@/types/db'

// Screens never call Supabase directly — same convention as src/data/vehicles.ts.
// camelCase in and out; snake_case stays inside this file.

export type DayOutcome = Enums<'day_outcome'>
export type ShortfallTreatment = Enums<'shortfall_treatment'>
export type ShortfallCause = Enums<'shortfall_cause'>
export type OverpaymentReason = Enums<'overpayment_reason'>
export type BalanceStatus = Enums<'balance_status'>
export type LedgerCategory = Enums<'ledger_category'>

/**
 * "Vehicle Payment" only — every vehicle type except BOX_TRUCK, which is
 * trip-based, not day_outcome-based, and deferred per the Phase 5 plan.
 */
export function isDayOutcomeEligible(vehicleType: string): boolean {
  return vehicleType !== 'BOX_TRUCK'
}

/**
 * Today's business date (Africa/Freetown, server-computed) — for
 * pre-filling a date field, never for storing a value directly. CLAUDE.md:
 * never derive a business date from new Date() on the client.
 */
export async function fetchFreetownToday(): Promise<string> {
  const { data, error } = await supabase.rpc('freetown_today')
  if (error) throw error
  return data
}

export interface RecordDailyPaymentInput {
  vehicleId: string
  serviceDate: string
  dayOutcome: DayOutcome
  receivedAmountMinor: number
  shortfallCause?: ShortfallCause
  shortfallNote?: string
  overpaymentReason?: OverpaymentReason
}

/** Records one vehicle-day payment and its consequences atomically —
 *  public.record_daily_payment(). Returns the new daily_payment_records id. */
export async function recordDailyPayment(input: RecordDailyPaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_daily_payment', {
    p_client_record_id: crypto.randomUUID(),
    p_vehicle_id: input.vehicleId,
    p_service_date: input.serviceDate,
    p_day_outcome: input.dayOutcome,
    p_received_amount_minor: input.receivedAmountMinor,
    ...(input.shortfallCause ? { p_shortfall_cause: input.shortfallCause } : {}),
    ...(input.shortfallNote ? { p_shortfall_note: input.shortfallNote } : {}),
    ...(input.overpaymentReason ? { p_overpayment_reason: input.overpaymentReason } : {}),
  })
  if (error) throw error
  return data
}

export interface RecordBundledPaymentInput {
  vehicleId: string
  coversFromDate: string
  daysCovered: number
  totalAmountMinor: number
  receivedAt?: string
  note?: string
}

/** Records several consecutive days as one lump-sum catch-up payment —
 *  public.record_bundled_payment(). Returns the new bundled_payments id. */
export async function recordBundledPayment(input: RecordBundledPaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_bundled_payment', {
    p_client_record_id: crypto.randomUUID(),
    p_vehicle_id: input.vehicleId,
    p_covers_from_date: input.coversFromDate,
    p_days_covered: input.daysCovered,
    p_total_amount_minor: input.totalAmountMinor,
    ...(input.receivedAt ? { p_received_at: input.receivedAt } : {}),
    ...(input.note ? { p_note: input.note } : {}),
  })
  if (error) throw error
  return data
}

/** General ledger entry with no vehicle-day behind it ("Other Payment") —
 *  a plain insert, RLS already allows it; the ledger_entries trigger from
 *  Phase 5's migration writes the matching activity_records row since this
 *  has no source_type. */
export interface RecordOtherPaymentInput {
  direction: LedgerDirection
  amountMinor: number
  category: LedgerCategory
  applyDate: string
  note?: string
  currentUserId: string
}

export async function recordOtherPayment(input: RecordOtherPaymentInput): Promise<void> {
  const { error } = await supabase.from('ledger_entries').insert({
    client_record_id: crypto.randomUUID(),
    direction: input.direction,
    amount_minor: input.amountMinor,
    category: input.category,
    applies_to_date: input.applyDate,
    entered_by_user_id: input.currentUserId,
    ...(input.note ? { note: input.note } : {}),
  })
  if (error) throw error
}

export interface DailyPaymentRecord {
  id: string
  vehicleId: string
  driverId: string | null
  serviceDate: string
  dayOutcome: DayOutcome
  expectedAmountMinor: number
  receivedAmountMinor: number
  shortfallAmountMinor: number
  shortfallTreatment: ShortfallTreatment | null
  shortfallCause: ShortfallCause | null
  shortfallNote: string | null
  overpaymentReason: OverpaymentReason | null
  shortfallTreatmentOverride: ShortfallTreatment | null
  shortfallTreatmentOverrideReason: string | null
}

const DAILY_PAYMENT_COLUMNS =
  'id, vehicle_id, driver_id, service_date, day_outcome, expected_amount_minor, received_amount_minor, shortfall_amount_minor, shortfall_treatment, shortfall_cause, shortfall_note, overpayment_reason, shortfall_treatment_override, shortfall_treatment_override_reason'

export async function fetchDailyPaymentRecord(id: string): Promise<DailyPaymentRecord | null> {
  const { data, error } = await supabase.from('daily_payment_records').select(DAILY_PAYMENT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    vehicleId: data.vehicle_id,
    driverId: data.driver_id,
    serviceDate: data.service_date,
    dayOutcome: data.day_outcome,
    expectedAmountMinor: data.expected_amount_minor,
    receivedAmountMinor: data.received_amount_minor,
    shortfallAmountMinor: data.shortfall_amount_minor ?? 0,
    shortfallTreatment: data.shortfall_treatment,
    shortfallCause: data.shortfall_cause,
    shortfallNote: data.shortfall_note,
    overpaymentReason: data.overpayment_reason,
    shortfallTreatmentOverride: data.shortfall_treatment_override,
    shortfallTreatmentOverrideReason: data.shortfall_treatment_override_reason,
  }
}

/** Owner/Admin or Fleet Manager only, enforced inside the function body —
 *  public.override_shortfall_treatment(). */
export async function overrideShortfallTreatment(dailyPaymentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('override_shortfall_treatment', {
    p_daily_payment_id: dailyPaymentId,
    p_reason: reason,
  })
  if (error) throw error
}

export interface OutstandingBalance {
  id: string
  vehicleId: string | null
  originalAmountMinor: number
  remainingAmountMinor: number
  promisedDate: string | null
  status: BalanceStatus
  createdAt: string
  closedAt: string | null
}

const BALANCE_COLUMNS = 'id, vehicle_id, original_amount_minor, remaining_amount_minor, promised_date, status, created_at, closed_at'

/** Every balance a driver has ever had, most recent first — SPEC's driver
 *  profile: "balance history with causes and clearance dates." (Causes
 *  live on the originating daily_payment_records row, not here.) */
export async function fetchOutstandingBalancesForDriver(driverId: string): Promise<OutstandingBalance[]> {
  const { data, error } = await supabase
    .from('outstanding_balances')
    .select(BALANCE_COLUMNS)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    originalAmountMinor: row.original_amount_minor,
    remainingAmountMinor: row.remaining_amount_minor,
    promisedDate: row.promised_date,
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  }))
}
