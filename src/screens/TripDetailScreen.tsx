import { useEffect, useState } from 'react'
import { LEDGER_CATEGORY_LABELS, TRIP_STATUS_LABELS, WEIGHT_UNIT_LABELS } from '@/constants/labels'
import { addTripExpense, fetchTripDetail, type TripDetail, type TripExpenseChoice } from '@/data/accounting'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'

interface TripDetailScreenProps {
  tripId: string
  onBack: () => void
}

const EXPENSE_CHOICES: { value: TripExpenseChoice; label: string }[] = [
  { value: 'FUEL', label: 'Fuel' },
  { value: 'ROAD_CHECKPOINT', label: 'Road / checkpoint' },
  { value: 'DRIVER_PAY', label: 'Driver pay' },
  { value: 'HELPER_PAY', label: 'Helper pay' },
]

export function TripDetailScreen({ tripId, onBack }: TripDetailScreenProps) {
  const [trip, setTrip] = useState<TripDetail | null | undefined>(undefined)
  const [choice, setChoice] = useState<TripExpenseChoice>('FUEL')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTripDetail(tripId)
      .then((result) => {
        if (!cancelled) setTrip(result)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this trip. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  async function saveCost() {
    const amountMinor = parseMinorUnits(amount)
    if (amountMinor === null || amountMinor <= 0) {
      setError('Enter a cost greater than zero.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await addTripExpense({ tripId, choice, amountMinor, ...(note.trim() ? { note: note.trim() } : {}) })
      setAmount('')
      setNote('')
      setShowForm(false)
      setTrip(await fetchTripDetail(tripId))
    } catch {
      setError('Could not add this cost. Check the details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">← Back</button>
      {trip === undefined && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {trip === null && <p className="text-sm text-slate-500">Trip not found.</p>}
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

      {trip && (
        <>
          <div className="mb-5">
            <h1 className="font-heading text-xl font-bold text-slate-900">{trip.fleetId} trip</h1>
            <p className="text-sm text-slate-500">
              {trip.pickupLocation ?? '—'} → {trip.destinationLocation ?? '—'} · {trip.departedOn ?? '—'}
              {trip.returnedOn ? ` – ${trip.returnedOn}` : ''}
            </p>
            <p className="text-xs text-slate-400">{TRIP_STATUS_LABELS[trip.status]}</p>
          </div>

          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-900">Trip money</h2>
            <div className="flex justify-between border-b border-slate-100 py-2 text-sm">
              <span>Revenue</span><span>{formatMinorUnits(trip.revenueMinor)}</span>
            </div>
            {trip.expenses.map((expense) => (
              <div key={expense.id} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 text-sm">
                <span>{expense.note || LEDGER_CATEGORY_LABELS[expense.category]}</span>
                <span className="whitespace-nowrap text-red-600">−{formatMinorUnits(expense.amountMinor)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 text-sm font-medium"><span>Total costs</span><span>−{formatMinorUnits(trip.expenseMinor)}</span></div>
            <div className="flex justify-between border-t border-slate-300 pt-3 font-semibold"><span>Net</span><span className={trip.netMinor < 0 ? 'text-red-600' : 'text-emerald-700'}>{formatMinorUnits(trip.netMinor)}</span></div>
          </section>

          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold text-slate-900">Trip details</h2>
            <p className="text-sm text-slate-600">Helper: {trip.helperName ?? 'Not set'}</p>
            <p className="text-sm text-slate-600">
              Load: {trip.loadQuantity ?? '—'} units · {trip.loadWeight ?? '—'} {trip.loadWeightUnit ? WEIGHT_UNIT_LABELS[trip.loadWeightUnit] : ''}
            </p>
            {trip.notes && <p className="mt-2 text-sm text-slate-600">{trip.notes}</p>}
          </section>

          {!showForm ? (
            <button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-primary-600 px-4 py-3 font-medium text-white">Add missing cost</button>
          ) : (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-900">Add missing cost</h2>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="min-w-0 text-sm font-medium text-slate-700">Cost type
                  <select value={choice} onChange={(event) => setChoice(event.target.value as TripExpenseChoice)} className="mt-1 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base">
                    {EXPENSE_CHOICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="min-w-0 text-sm font-medium text-slate-700">Amount
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className="mt-1 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-base" />
                </label>
              </div>
              <label className="mt-3 block text-sm font-medium text-slate-700">Note (optional)
                <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-base" />
              </label>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={saveCost} disabled={submitting} className="rounded-xl bg-primary-600 px-4 py-3 font-medium text-white disabled:opacity-50">{submitting ? 'Saving…' : 'Save cost'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-4 py-3 text-slate-700">Cancel</button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
