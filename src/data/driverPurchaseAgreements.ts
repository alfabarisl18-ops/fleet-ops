import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

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
}

const AGREEMENT_COLUMNS =
  'id, vehicle_id, driver_id, agreement_amount_minor, regular_payment_minor, payment_frequency, started_on, expected_completion_on, ownership_transfer_status'

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
 * The caller (SetUpDriverPurchaseAgreementForm) is expected to have already
 * called fetchOpenAgreementForVehicle and blocked submission if one exists —
 * this still maps the database's own dpa_one_open_per_vehicle unique-index
 * violation to the same result shape, as a backstop against a race between
 * two near-simultaneous submissions, not as the primary check.
 */
export async function createAgreement(input: CreateAgreementInput): Promise<CreateAgreementResult> {
  const { data, error } = await supabase
    .from('driver_purchase_agreements')
    .insert({
      client_record_id: crypto.randomUUID(),
      vehicle_id: input.vehicleId,
      driver_id: input.driverId,
      agreement_amount_minor: input.agreementAmountMinor,
      regular_payment_minor: input.regularPaymentMinor,
      payment_frequency: input.paymentFrequency,
      started_on: input.startedOn,
      expected_completion_on: input.expectedCompletionOn ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: AGREEMENT_ALREADY_EXISTS }
    }
    throw error
  }

  return { ok: true, id: data.id }
}
