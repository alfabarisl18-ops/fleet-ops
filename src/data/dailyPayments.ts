import { supabase } from '@/lib/supabase'
import type { WriteOutcome } from '@/lib/offlineQueue'
import { isDailyPaymentDuplicate, withOfflineQueue } from '@/lib/offlineQueue'
import type { LedgerDirection } from '@/data/activityRecords'
import { flagDuplicatePayment } from '@/data/accounting'
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

type RecordDailyPaymentPayload = RecordDailyPaymentInput & { clientRecordId: string }

async function recordDailyPaymentLive(payload: RecordDailyPaymentPayload): Promise<string> {
  const { data, error } = await supabase.rpc('record_daily_payment', {
    p_client_record_id: payload.clientRecordId,
    p_vehicle_id: payload.vehicleId,
    p_service_date: payload.serviceDate,
    p_day_outcome: payload.dayOutcome,
    p_received_amount_minor: payload.receivedAmountMinor,
    ...(payload.shortfallCause ? { p_shortfall_cause: payload.shortfallCause } : {}),
    ...(payload.shortfallNote ? { p_shortfall_note: payload.shortfallNote } : {}),
    ...(payload.overpaymentReason ? { p_overpayment_reason: payload.overpaymentReason } : {}),
  })
  if (error) throw error
  return data
}

/** Specific to recordDailyPayment — the only one of the 9 mobile-write
 *  functions that can hit SPEC's same-vehicle-day collision. Kept out of
 *  the shared WriteOutcome<T> so the other 8 callers don't have to
 *  handle a case that can never happen to them. */
export type RecordDailyPaymentOutcome = WriteOutcome<string> | { status: 'duplicate' }

/** Records one vehicle-day payment and its consequences atomically —
 *  public.record_daily_payment(). Offline-queue-aware (Phase 9): queues
 *  on the device when there's no signal or the network drops mid-call,
 *  see src/lib/offlineQueue.ts. SPEC section 8's same-vehicle-day
 *  collision can happen on a live double-submission just as easily as
 *  on a queued retry (two collectors can both be online) — caught here
 *  too, not only in the queue's own flush handler. */
export async function recordDailyPayment(input: RecordDailyPaymentInput): Promise<RecordDailyPaymentOutcome> {
  const payload: RecordDailyPaymentPayload = { ...input, clientRecordId: crypto.randomUUID() }
  try {
    return await withOfflineQueue('recordDailyPayment', payload.clientRecordId, payload, () => recordDailyPaymentLive(payload))
  } catch (err) {
    if (isDailyPaymentDuplicate(err)) {
      await flagDuplicatePayment(payload.vehicleId, payload.serviceDate, payload)
      return { status: 'duplicate' }
    }
    throw err
  }
}

/** For the offline-queue replay handler only — src/lib/offlineQueueReplay.ts. */
export async function replayRecordDailyPayment(payload: unknown): Promise<string> {
  return recordDailyPaymentLive(payload as RecordDailyPaymentPayload)
}

export interface RecordBundledPaymentInput {
  vehicleId: string
  coversFromDate: string
  daysCovered: number
  totalAmountMinor: number
  receivedAt?: string
  note?: string
}

type RecordBundledPaymentPayload = RecordBundledPaymentInput & { clientRecordId: string }

async function recordBundledPaymentLive(payload: RecordBundledPaymentPayload): Promise<string> {
  const { data, error } = await supabase.rpc('record_bundled_payment', {
    p_client_record_id: payload.clientRecordId,
    p_vehicle_id: payload.vehicleId,
    p_covers_from_date: payload.coversFromDate,
    p_days_covered: payload.daysCovered,
    p_total_amount_minor: payload.totalAmountMinor,
    ...(payload.receivedAt ? { p_received_at: payload.receivedAt } : {}),
    ...(payload.note ? { p_note: payload.note } : {}),
  })
  if (error) throw error
  return data
}

/** Records several consecutive days as one lump-sum catch-up payment —
 *  public.record_bundled_payment(). Offline-queue-aware (Phase 9). */
export async function recordBundledPayment(input: RecordBundledPaymentInput): Promise<WriteOutcome<string>> {
  const payload: RecordBundledPaymentPayload = { ...input, clientRecordId: crypto.randomUUID() }
  return withOfflineQueue('recordBundledPayment', payload.clientRecordId, payload, () => recordBundledPaymentLive(payload))
}

/** For the offline-queue replay handler only — src/lib/offlineQueueReplay.ts. */
export async function replayRecordBundledPayment(payload: unknown): Promise<string> {
  return recordBundledPaymentLive(payload as RecordBundledPaymentPayload)
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

type RecordOtherPaymentPayload = RecordOtherPaymentInput & { clientRecordId: string }

async function recordOtherPaymentLive(payload: RecordOtherPaymentPayload): Promise<void> {
  const { error } = await supabase.from('ledger_entries').insert({
    client_record_id: payload.clientRecordId,
    direction: payload.direction,
    amount_minor: payload.amountMinor,
    category: payload.category,
    applies_to_date: payload.applyDate,
    entered_by_user_id: payload.currentUserId,
    ...(payload.note ? { note: payload.note } : {}),
  })
  if (error) throw error
}

/** Offline-queue-aware (Phase 9). */
export async function recordOtherPayment(input: RecordOtherPaymentInput): Promise<WriteOutcome<void>> {
  const payload: RecordOtherPaymentPayload = { ...input, clientRecordId: crypto.randomUUID() }
  return withOfflineQueue('recordOtherPayment', payload.clientRecordId, payload, () => recordOtherPaymentLive(payload))
}

/** For the offline-queue replay handler only — src/lib/offlineQueueReplay.ts. */
export async function replayRecordOtherPayment(payload: unknown): Promise<void> {
  return recordOtherPaymentLive(payload as RecordOtherPaymentPayload)
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
  writeOffReason: string | null
}

const BALANCE_COLUMNS =
  'id, vehicle_id, original_amount_minor, remaining_amount_minor, promised_date, status, created_at, closed_at, write_off_reason'

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
    writeOffReason: row.write_off_reason,
  }))
}

/**
 * SPEC open question 7, answered: forgiving a driver's debt is Owner/Admin
 * only, with a required reason — enforced inside public.forgive_driver_debt
 * itself (outstanding_balances' own RLS is broader than this one action).
 * Also records the forgiven amount as an OTHER_EXPENSE ledger entry, same
 * as the function's own comment explains.
 */
export async function forgiveDriverDebt(balanceId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('forgive_driver_debt', { p_balance_id: balanceId, p_reason: reason })
  if (error) throw error
}
