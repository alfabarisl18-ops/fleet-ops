import { useEffect, useState } from 'react'
import { EXPENSE_LEDGER_CATEGORIES, INCOME_LEDGER_CATEGORIES, LEDGER_CATEGORY_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { LedgerCategory } from '@/data/dailyPayments'
import { fetchFreetownToday, recordOtherPayment } from '@/data/dailyPayments'

interface OtherPaymentFormProps {
  currentUserId: string
  onDone: () => void
}

/**
 * SPEC section 5: "No intermediate 'Choose Payment' step. Show: amount
 * input, Income / Business Expense toggle, date, category, note, Done."
 * Not tied to a vehicle or driver — a general ledger entry.
 */
export function OtherPaymentForm({ currentUserId, onDone }: OtherPaymentFormProps) {
  const [direction, setDirection] = useState<'INCOME' | 'EXPENSE'>('INCOME')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<LedgerCategory>('OTHER_INCOME')
  const [applyDate, setApplyDate] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const categories = direction === 'INCOME' ? INCOME_LEDGER_CATEGORIES : EXPENSE_LEDGER_CATEGORIES
  const amountMinor = parseMinorUnits(amount)

  useEffect(() => {
    let cancelled = false
    fetchFreetownToday()
      .then((today) => {
        if (!cancelled) setApplyDate((current) => (current === '' ? today : current))
      })
      .catch(() => {
        /* Date field just stays blank; not fatal, the person can still pick one. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  function switchDirection(next: 'INCOME' | 'EXPENSE') {
    setDirection(next)
    setCategory(next === 'INCOME' ? 'OTHER_INCOME' : 'OTHER_EXPENSE')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (amount.trim() === '' || amountMinor === null || amountMinor <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (applyDate === '') {
      setError('Pick a date.')
      return
    }

    setSubmitting(true)
    try {
      await recordOtherPayment({
        direction,
        amountMinor,
        category,
        applyDate,
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
        currentUserId,
      })
      setDone(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold text-slate-900">Recorded</p>
        <p className="text-sm text-slate-500">
          {direction === 'EXPENSE' ? '−' : ''}
          {formatMinorUnits(amountMinor ?? 0).replace('−', '')} · {LEDGER_CATEGORY_LABELS[category]}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-2 rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Other Payment</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex rounded-lg border border-slate-300 p-1">
          <button
            type="button"
            onClick={() => switchDirection('INCOME')}
            className={`flex-1 rounded-md py-3 text-base font-medium ${
              direction === 'INCOME' ? 'bg-slate-900 text-white' : 'text-slate-700'
            }`}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => switchDirection('EXPENSE')}
            className={`flex-1 rounded-md py-3 text-base font-medium ${
              direction === 'EXPENSE' ? 'bg-slate-900 text-white' : 'text-slate-700'
            }`}
          >
            Business Expense
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
          {amountMinor !== null && amount.trim() !== '' && (
            <span className="text-xs text-slate-500">{formatMinorUnits(amountMinor)}</span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as LedgerCategory)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {LEDGER_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Date</span>
          <input
            type="date"
            required
            value={applyDate}
            onChange={(e) => setApplyDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
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
          className="mt-2 rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Done'}
        </button>
      </form>
    </div>
  )
}
