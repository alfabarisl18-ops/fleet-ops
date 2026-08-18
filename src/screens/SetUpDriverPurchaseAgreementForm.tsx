import { useEffect, useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { PAYMENT_FREQUENCY_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { DriverListItem } from '@/data/drivers'
import { fetchDrivers } from '@/data/drivers'
import type { PaymentFrequency } from '@/data/driverPurchaseAgreements'
import { AGREEMENT_ALREADY_EXISTS, setUpAgreement, fetchOpenAgreementForVehicle } from '@/data/driverPurchaseAgreements'
import type { VehicleDetail } from '@/data/vehicles'
import { fetchVehicle } from '@/data/vehicles'

interface SetUpDriverPurchaseAgreementFormProps {
  vehicleId: string
  onDone: () => void
  onCancel: () => void
}

const FREQUENCIES: PaymentFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY']

/**
 * Mirrors set_up_driver_purchase_agreement's own computation exactly
 * (integer division, weekly / 7, monthly / days in that calendar month) —
 * shown before submit so nobody sets an installment up blind. Returns
 * null only when there isn't enough information yet (no start date for a
 * monthly agreement, since the days-in-month depends on it).
 */
function computeDailyEquivalentMinor(
  regularPaymentMinor: number,
  frequency: PaymentFrequency,
  startedOn: string,
): number | null {
  if (frequency === 'DAILY') return regularPaymentMinor
  if (frequency === 'WEEKLY') return Math.floor(regularPaymentMinor / 7)
  if (startedOn === '') return null
  const parts = startedOn.split('-').map(Number)
  const year = parts[0]
  const month = parts[1]
  if (year === undefined || month === undefined) return null
  const daysInMonth = new Date(year, month, 0).getDate()
  return Math.floor(regularPaymentMinor / daysInMonth)
}

/**
 * Exact behavior per the Phase 3 plan (user-confirmed scope): driver picker
 * is every driver, current or former, not filtered to this vehicle's
 * current_driver_id. ownership_transfer_status is never shown — the column
 * default (NOT_STARTED) ships as-is. No date-eligibility check of any kind.
 */
export function SetUpDriverPurchaseAgreementForm({
  vehicleId,
  onDone,
  onCancel,
}: SetUpDriverPurchaseAgreementFormProps) {
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null)
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null)
  const [alreadyExists, setAlreadyExists] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [driverId, setDriverId] = useState('')
  const [agreementAmount, setAgreementAmount] = useState('')
  const [regularPayment, setRegularPayment] = useState('')
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>('DAILY')
  const [startedOn, setStartedOn] = useState('')
  const [expectedCompletionOn, setExpectedCompletionOn] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchVehicle(vehicleId), fetchDrivers(), fetchOpenAgreementForVehicle(vehicleId)])
      .then(([v, d, existing]) => {
        if (cancelled) return
        setVehicle(v)
        setDrivers(d)
        setAlreadyExists(existing !== null)
        if (d[0]) setDriverId(d[0].id)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load this form. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [vehicleId])

  const agreementAmountMinor = parseMinorUnits(agreementAmount)
  const regularPaymentMinor = parseMinorUnits(regularPayment)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (driverId === '') {
      setError('Choose a driver.')
      return
    }
    if (agreementAmount.trim() === '' || agreementAmountMinor === null || agreementAmountMinor <= 0) {
      setError('Agreement amount is not a valid amount.')
      return
    }
    if (regularPayment.trim() === '' || regularPaymentMinor === null || regularPaymentMinor <= 0) {
      setError('Regular payment is not a valid amount.')
      return
    }
    if (startedOn === '') {
      setError('Start date is required.')
      return
    }
    if (expectedCompletionOn !== '' && expectedCompletionOn < startedOn) {
      setError('Expected completion date cannot be before the start date.')
      return
    }

    setSubmitting(true)
    try {
      const result = await setUpAgreement({
        vehicleId,
        driverId,
        agreementAmountMinor,
        regularPaymentMinor,
        paymentFrequency,
        startedOn,
        ...(expectedCompletionOn !== '' ? { expectedCompletionOn } : {}),
      })
      if (!result.ok) {
        if (result.error === AGREEMENT_ALREADY_EXISTS) {
          setAlreadyExists(true)
        } else {
          setError('Something went wrong. Try again.')
        }
        return
      }
      onDone()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p role="alert" className="text-sm text-red-600">
          {loadError}
        </p>
      </div>
    )
  }

  if (!vehicle || !drivers) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-1 flex items-center gap-3">
        <IconChip section="vehicles" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Set up driver-purchase agreement</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">{vehicle.fleetId}</p>

      {alreadyExists ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          This vehicle already has an open driver-purchase agreement. Cancel or complete it before starting a new one.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Driver</span>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Agreement amount</span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={agreementAmount}
              onChange={(e) => setAgreementAmount(e.target.value)}
              placeholder="0.00"
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            {agreementAmountMinor !== null && agreementAmount.trim() !== '' && (
              <span className="text-xs text-slate-500">{formatMinorUnits(agreementAmountMinor)}</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Regular payment</span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={regularPayment}
              onChange={(e) => setRegularPayment(e.target.value)}
              placeholder="0.00"
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            {regularPaymentMinor !== null && regularPayment.trim() !== '' && (
              <span className="text-xs text-slate-500">{formatMinorUnits(regularPaymentMinor)}</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Payment frequency</span>
            <select
              value={paymentFrequency}
              onChange={(e) => setPaymentFrequency(e.target.value as PaymentFrequency)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {PAYMENT_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Start date</span>
            <input
              type="date"
              required
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>

          {regularPaymentMinor !== null && regularPaymentMinor > 0 && (
            <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm">
              {(() => {
                const daily = computeDailyEquivalentMinor(regularPaymentMinor, paymentFrequency, startedOn)
                if (daily === null) {
                  return <span className="text-slate-500">Add a start date to see the daily amount this becomes.</span>
                }
                return (
                  <>
                    <p className="font-medium text-slate-900">New daily target: {formatMinorUnits(daily)}</p>
                    <p className="mt-1 text-slate-600">
                      This vehicle&apos;s daily payment target will change to this amount. Every day the driver comes
                      up short — Full Day, Half Day, or Breakdown — the shortfall becomes driver debt while this
                      agreement is active.
                    </p>
                  </>
                )
              })()}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Expected completion date (optional)</span>
            <input
              type="date"
              value={expectedCompletionOn}
              onChange={(e) => setExpectedCompletionOn(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Set up agreement'}
          </button>
        </form>
      )}
    </div>
  )
}
