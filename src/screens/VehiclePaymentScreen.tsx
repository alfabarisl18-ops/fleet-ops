import { useEffect, useMemo, useState } from 'react'
import { DAY_OUTCOME_LABELS, OVERPAYMENT_REASON_LABELS, SHORTFALL_CAUSE_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { DayOutcome, OverpaymentReason, ShortfallCause } from '@/data/dailyPayments'
import { fetchFreetownToday, isDayOutcomeEligible, recordBundledPayment, recordDailyPayment } from '@/data/dailyPayments'
import type { VehicleListItem, VehicleType } from '@/data/vehicles'
import { fetchVehicle, fetchVehicles } from '@/data/vehicles'

interface VehiclePaymentScreenProps {
  onDone: () => void
}

type Step =
  | { name: 'pick' }
  | { name: 'day-outcome'; vehicleId: string; fleetId: string; date: string; expectedAmountMinor: number }
  | { name: 'bundle'; vehicleId: string; fleetId: string; startDate: string; expectedAmountMinor: number }

const DAY_OUTCOMES: DayOutcome[] = ['FULL_DAY', 'HALF_DAY', 'DRIVERS_DAY', 'BREAKDOWN', 'DID_NOT_WORK']
const SHORTFALL_CAUSES: ShortfallCause[] = ['BREAKDOWN', 'ACCIDENT', 'POLICE_CHECKPOINT', 'OTHER']
const OVERPAYMENT_REASONS: OverpaymentReason[] = ['SETTLING_BALANCE', 'ADVANCE', 'OTHER']

/**
 * SPEC section 5: "After choosing a vehicle and date, ask What happened
 * that day?" Vehicles grouped by type, box trucks excluded — see the
 * Phase 5 plan for why.
 */
export function VehiclePaymentScreen({ onDone }: VehiclePaymentScreenProps) {
  const [step, setStep] = useState<Step>({ name: 'pick' })

  if (step.name === 'day-outcome') {
    return (
      <DayOutcomeForm
        vehicleId={step.vehicleId}
        fleetId={step.fleetId}
        date={step.date}
        expectedAmountMinor={step.expectedAmountMinor}
        onDone={onDone}
        onBack={() => setStep({ name: 'pick' })}
      />
    )
  }

  if (step.name === 'bundle') {
    return (
      <BundledPaymentForm
        vehicleId={step.vehicleId}
        fleetId={step.fleetId}
        startDate={step.startDate}
        expectedAmountMinor={step.expectedAmountMinor}
        onDone={onDone}
        onBack={() => setStep({ name: 'pick' })}
      />
    )
  }

  return (
    <VehiclePicker
      onChoose={async (vehicleId, fleetId, date, bundle) => {
        const detail = await fetchVehicle(vehicleId)
        const expectedAmountMinor = detail?.expectedDailyAmountMinor ?? 0
        if (bundle) {
          setStep({ name: 'bundle', vehicleId, fleetId, startDate: date, expectedAmountMinor })
        } else {
          setStep({ name: 'day-outcome', vehicleId, fleetId, date, expectedAmountMinor })
        }
      }}
    />
  )
}

function VehiclePicker({
  onChoose,
}: {
  onChoose: (vehicleId: string, fleetId: string, date: string, bundle: boolean) => void
}) {
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null)
  const [date, setDate] = useState('')
  const [bundle, setBundle] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchVehicles(), fetchFreetownToday()])
      .then(([v, today]) => {
        if (cancelled) return
        setVehicles(v.filter((vehicle) => isDayOutcomeEligible(vehicle.type)))
        setDate(today)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load vehicles. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    if (!vehicles) return new Map<VehicleType, VehicleListItem[]>()
    const map = new Map<VehicleType, VehicleListItem[]>()
    for (const v of vehicles) {
      const list = map.get(v.type) ?? []
      list.push(v)
      map.set(v.type, list)
    }
    return map
  }, [vehicles])

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Vehicle Payment</h1>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <label className="mb-2 flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Date</span>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-4 py-3 text-base"
        />
      </label>

      <label className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={bundle} onChange={(e) => setBundle(e.target.checked)} className="h-5 w-5" />
        Several days paid together
      </label>

      {vehicles === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {[...grouped.entries()].map(([type, list]) => (
        <div key={type} className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{VEHICLE_TYPE_LABELS[type]}</h2>
          <ul className="flex flex-col gap-2">
            {list.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  disabled={date === ''}
                  onClick={() => onChoose(v.id, v.fleetId, date, bundle)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50 disabled:opacity-50"
                >
                  {v.fleetId}
                  {v.plate ? <span className="ml-2 text-sm font-normal text-slate-500">{v.plate}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function DayOutcomeForm({
  vehicleId,
  fleetId,
  date,
  expectedAmountMinor,
  onDone,
  onBack,
}: {
  vehicleId: string
  fleetId: string
  date: string
  expectedAmountMinor: number
  onDone: () => void
  onBack: () => void
}) {
  const [outcome, setOutcome] = useState<DayOutcome | null>(null)
  const [amount, setAmount] = useState('')
  const [showAmountField, setShowAmountField] = useState(false)
  const [cause, setCause] = useState<ShortfallCause | null>(null)
  const [note, setNote] = useState('')
  const [overpaymentReason, setOverpaymentReason] = useState<OverpaymentReason | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountMinor = amount.trim() === '' ? null : parseMinorUnits(amount)
  const receivedMinor = outcome === 'FULL_DAY' && !showAmountField ? expectedAmountMinor : (amountMinor ?? 0)
  const isOverpaid = receivedMinor > expectedAmountMinor

  function choose(o: DayOutcome) {
    setOutcome(o)
    setAmount('')
    setShowAmountField(o === 'HALF_DAY' || o === 'BREAKDOWN')
    setCause(null)
    setOverpaymentReason(null)
    setError(null)
  }

  async function submit() {
    if (!outcome) return
    setError(null)

    if (outcome === 'HALF_DAY' && cause === null) {
      setError('Choose a cause.')
      return
    }
    if (cause === 'OTHER' && note.trim() === '') {
      setError('Add a note for "Other."')
      return
    }
    if (showAmountField && (amount.trim() === '' || amountMinor === null)) {
      setError('Enter a valid amount.')
      return
    }
    if (isOverpaid && overpaymentReason === null) {
      setError('Choose why this is more than expected.')
      return
    }
    if (overpaymentReason === 'OTHER' && note.trim() === '') {
      setError('Add a note for "Other."')
      return
    }

    setSubmitting(true)
    try {
      await recordDailyPayment({
        vehicleId,
        serviceDate: date,
        dayOutcome: outcome,
        receivedAmountMinor: receivedMinor,
        ...(cause ? { shortfallCause: cause } : {}),
        ...(note.trim() !== '' ? { shortfallNote: note.trim() } : {}),
        ...(overpaymentReason ? { overpaymentReason } : {}),
      })
      onDone()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-1 text-lg font-semibold text-slate-900">{fleetId}</h1>
      <p className="mb-4 text-sm text-slate-500">{date}</p>

      {!outcome && (
        <>
          <p className="mb-3 text-base font-medium text-slate-700">What happened that day?</p>
          <div className="flex flex-col gap-2">
            {DAY_OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => choose(o)}
                className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
              >
                {DAY_OUTCOME_LABELS[o]}
              </button>
            ))}
          </div>
        </>
      )}

      {outcome && (
        <div className="flex flex-col gap-4">
          <p className="text-base font-medium text-slate-700">{DAY_OUTCOME_LABELS[outcome]}</p>

          {outcome === 'HALF_DAY' && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Cause</span>
              <select
                value={cause ?? ''}
                onChange={(e) => setCause(e.target.value as ShortfallCause)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
              >
                <option value="" disabled>
                  Choose a cause
                </option>
                {SHORTFALL_CAUSES.map((c) => (
                  <option key={c} value={c}>
                    {SHORTFALL_CAUSE_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {outcome === 'FULL_DAY' && !showAmountField && (
            <>
              <p className="text-2xl font-semibold text-slate-900">{formatMinorUnits(expectedAmountMinor)}</p>
              <button type="button" onClick={() => setShowAmountField(true)} className="self-start text-sm font-medium text-slate-600 underline decoration-slate-300">
                Paid less than expected
              </button>
            </>
          )}

          {(showAmountField || outcome === 'HALF_DAY' || outcome === 'BREAKDOWN') && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Amount received</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="rounded-lg border border-slate-300 px-4 py-3 text-base"
              />
              {amountMinor !== null && amount.trim() !== '' && (
                <span className="text-xs text-slate-500">{formatMinorUnits(amountMinor)}</span>
              )}
            </label>
          )}

          {isOverpaid && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">This is more than expected — why?</span>
              <select
                value={overpaymentReason ?? ''}
                onChange={(e) => setOverpaymentReason(e.target.value as OverpaymentReason)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
              >
                <option value="" disabled>
                  Choose a reason
                </option>
                {OVERPAYMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {OVERPAYMENT_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(outcome === 'HALF_DAY' || outcome === 'BREAKDOWN' || overpaymentReason === 'OTHER' || cause === 'OTHER') && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Note{cause === 'OTHER' || overpaymentReason === 'OTHER' ? ' (required)' : ' (optional)'}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="rounded-lg border border-slate-300 px-4 py-3 text-base"
              />
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Done'}
          </button>
        </div>
      )}
    </div>
  )
}

function BundledPaymentForm({
  vehicleId,
  fleetId,
  startDate,
  expectedAmountMinor,
  onDone,
  onBack,
}: {
  vehicleId: string
  fleetId: string
  startDate: string
  expectedAmountMinor: number
  onDone: () => void
  onBack: () => void
}) {
  const [days, setDays] = useState(1)
  const [total, setTotal] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pure calendar arithmetic on the already-chosen start date — a preview
  // only, the real covers_to_date is a server-side generated column. Uses
  // UTC throughout so the computation can't shift by a day depending on
  // the browser's timezone (the team spans Freetown, the US, and China).
  const endDate = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() + days - 1)
    return start.toISOString().slice(0, 10)
  }, [startDate, days])

  const totalMinor = total.trim() === '' ? null : parseMinorUnits(total)
  const suggestedTotal = expectedAmountMinor * days

  async function submit() {
    setError(null)
    if (total.trim() === '' || totalMinor === null || totalMinor <= 0) {
      setError('Enter a valid total amount.')
      return
    }

    setSubmitting(true)
    try {
      await recordBundledPayment({
        vehicleId,
        coversFromDate: startDate,
        daysCovered: days,
        totalAmountMinor: totalMinor,
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
      })
      onDone()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-1 text-lg font-semibold text-slate-900">{fleetId}</h1>
      <p className="mb-4 text-sm text-slate-500">Several days paid together, starting {startDate}</p>

      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Number of days</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDays((d) => Math.max(1, d - 1))}
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 text-xl font-medium text-slate-700 active:bg-slate-100"
              aria-label="Fewer days"
            >
              −
            </button>
            <span className="w-10 text-center text-xl font-semibold text-slate-900">{days}</span>
            <button
              type="button"
              onClick={() => setDays((d) => Math.min(366, d + 1))}
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 text-xl font-medium text-slate-700 active:bg-slate-100"
              aria-label="More days"
            >
              +
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-500">
          Covers {startDate} to <span className="font-medium text-slate-700">{endDate}</span>
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Total amount received</span>
          <input
            type="text"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder={formatMinorUnits(suggestedTotal).replace('SLE ', '')}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
          {totalMinor !== null && total.trim() !== '' && (
            <span className="text-xs text-slate-500">{formatMinorUnits(totalMinor)}</span>
          )}
          <span className="text-xs text-slate-400">Usual rate for {days} day(s): {formatMinorUnits(suggestedTotal)}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. older dates paid late"
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  )
}
