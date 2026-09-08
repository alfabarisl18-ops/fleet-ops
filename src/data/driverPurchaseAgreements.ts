import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'
import { rpcArgs } from '@/types/db'

export type PaymentFrequency = Enums<'payment_frequency'>
export type OwnershipTransferStatus = Enums<'ownership_transfer_status'>

export interface DriverPurchaseAgreement {
  id: string
  vehicleId: string
  driverId: string
  agreementAmountMinor: number
  regularPaymentMinor: number
  paymentFrequency: PaymentFrequency
  startedOn: string
  expectedCompletionOn: string | null
  ownershipTransferStatus: OwnershipTransferStatus
  cancellationReason: string | null
}

const AGREEMENT_COLUMNS =
  'id, vehicle_id, driver_id, agreement_amount_minor, regular_payment_minor, payment_frequency, started_on, expected_completion_on, ownership_transfer_status, cancellation_reason'

function toAgreement(row: {
  id: string
  vehicle_id: string
  driver_id: string
  agreement_amount_minor: number
  regular_payment_minor: number
  payment_frequency: PaymentFrequency
  started_on: string
  expected_completion_on: string | null
  ownership_transfer_status: OwnershipTransferStatus
  cancellation_reason: string | null
}): DriverPurchaseAgreement {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    agreementAmountMinor: row.agreement_amount_minor,
    regularPaymentMinor: row.regular_payment_minor,
    paymentFrequency: row.payment_frequency,
    startedOn: row.started_on,
    expectedCompletionOn: row.expected_completion_on,
    ownershipTransferStatus: row.ownership_transfer_status,
    cancellationReason: row.cancellation_reason,
  }
}

/**
 * The one open (not CANCELLED) agreement for a vehicle, or null. Used both
 * to display an existing agreement on the vehicle profile and to pre-check
 * before showing the setup form — mirrors dpa_one_open_per_vehicle
 * (20260808232316_fleet.sql) client-side, so the person setting one up sees
 * a clear message before submitting, not a raw constraint error after.
 */
export async function fetchOpenAgreementForVehicle(
  vehicleId: string,
): Promise<(DriverPurchaseAgreement & { driverName: string }) | null> {
  const { data, error } = await supabase
    .from('driver_purchase_agreements')
    .select(AGREEMENT_COLUMNS)
    .eq('vehicle_id', vehicleId)
    .neq('ownership_transfer_status', 'CANCELLED')
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const { data: driver } = await supabase.from('drivers').select('full_name').eq('id', data.driver_id).maybeSingle()

  return { ...toAgreement(data), driverName: driver?.full_name ?? '(unknown)' }
}

/** Every agreement a driver has ever held, most recent first. */
export async function fetchAgreementsForDriver(driverId: string): Promise<DriverPurchaseAgreement[]> {
  const { data, error } = await supabase
    .from('driver_purchase_agreements')
    .select(AGREEMENT_COLUMNS)
    .eq('driver_id', driverId)
    .order('started_on', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toAgreement)
}

export interface CreateAgreementInput {
  vehicleId: string
  driverId: string
  agreementAmountMinor: number
  regularPaymentMinor: number
  paymentFrequency: PaymentFrequency
  startedOn: string
  expectedCompletionOn?: string
}

export const AGREEMENT_ALREADY_EXISTS = 'AGREEMENT_ALREADY_EXISTS' as const

export type CreateAgreementResult =
  | { ok: true; id: string }
  | { ok: false; error: typeof AGREEMENT_ALREADY_EXISTS }

/**
 * Sets up the agreement AND sets the vehicle's daily target to the
 * installment's daily-equivalent, in one transaction
 * (public.set_up_driver_purchase_agreement) — the daily payment IS the
 * installment from here on, not a second, separate collection flow. The
 * caller (SetUpDriverPurchaseAgreementForm) is expected to have already
 * called fetchOpenAgreementForVehicle and blocked submission if one
 * exists — this still maps the database's own dpa_one_open_per_vehicle
 * unique-index violation to the same result shape, as a backstop against
 * a race between two near-simultaneous submissions, not as the primary
 * check.
 */
export async function setUpAgreement(input: CreateAgreementInput): Promise<CreateAgreementResult> {
  const { data, error } = await supabase.rpc(
    'set_up_driver_purchase_agreement',
    rpcArgs<'set_up_driver_purchase_agreement'>({
      p_client_record_id: crypto.randomUUID(),
      p_vehicle_id: input.vehicleId,
      p_driver_id: input.driverId,
      p_agreement_amount_minor: input.agreementAmountMinor,
      p_regular_payment_minor: input.regularPaymentMinor,
      p_payment_frequency: input.paymentFrequency,
      p_started_on: input.startedOn,
      p_expected_completion_on: input.expectedCompletionOn ?? null,
    }),
  )

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: AGREEMENT_ALREADY_EXISTS }
    }
    throw error
  }

  return { ok: true, id: data }
}

/** Marks the agreement paid off and archives the vehicle
 *  (public.complete_driver_purchase_agreement) — a manual decision, not
 *  automatic payoff detection. See fetchAgreementProgress for the figure
 *  a person uses to decide. */
export async function completeAgreement(agreementId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_driver_purchase_agreement', { p_agreement_id: agreementId })
  if (error) throw error
}

/** Reason required. Does not restore the vehicle's previous daily target
 *  — see updateExpectedDailyAmount in src/data/vehicles.ts. */
export async function cancelAgreement(agreementId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_driver_purchase_agreement', { p_agreement_id: agreementId, p_reason: reason })
  if (error) throw error
}

export interface PurchasePaymentContext {
  underAgreement: boolean
  deferred: boolean
  dailyAmountMinor: number | null
}

export async function fetchVehiclePurchasePaymentContext(vehicleId: string, serviceDate: string): Promise<PurchasePaymentContext> {
  const { data, error } = await supabase.rpc('vehicle_purchase_payment_context', { p_vehicle_id: vehicleId, p_service_date: serviceDate })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.underAgreement !== 'boolean' || typeof data.deferred !== 'boolean' || (data.dailyAmountMinor !== null && (typeof data.dailyAmountMinor !== 'number' || !Number.isSafeInteger(data.dailyAmountMinor)))) throw new Error('Invalid purchase payment context')
  return { underAgreement: data.underAgreement, deferred: data.deferred, dailyAmountMinor: data.dailyAmountMinor as number | null }
}

export interface AgreementProgress {
  paidMinor: number
  remainingMinor: number
  originalCompletionOn: string | null
  adjustedCompletionOn: string | null
  remainingDays: number | null
  adjustmentDays: number
  missingDays: number
  asOfDate: string
  estimatedBaseline: boolean
  policyEffectiveOn: string | null
}

export function parseAgreementProgress(value: unknown): AgreementProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid purchase progress')
  const v = value as Record<string, unknown>
  for (const key of ['paidMinor', 'remainingMinor', 'adjustmentDays', 'missingDays']) {
    if (typeof v[key] !== 'number' || !Number.isSafeInteger(v[key])) throw new Error('Invalid purchase progress')
  }
  if (v.remainingDays !== null && (typeof v.remainingDays !== 'number' || !Number.isSafeInteger(v.remainingDays))) throw new Error('Invalid remaining days')
  for (const key of ['originalCompletionOn', 'adjustedCompletionOn', 'policyEffectiveOn']) {
    if (v[key] !== null && (typeof v[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v[key]))) throw new Error('Invalid purchase date')
  }
  if (typeof v.asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.asOfDate) || typeof v.estimatedBaseline !== 'boolean') throw new Error('Invalid purchase progress')
  return v as unknown as AgreementProgress
}

/** Server allocation excludes unrelated settlements and held advances. */
export async function fetchAgreementProgress(agreementId: string): Promise<AgreementProgress> {
  const { data, error } = await supabase.rpc('driver_purchase_progress', { p_agreement_id: agreementId })
  if (error) throw error
  return parseAgreementProgress(data)
}
