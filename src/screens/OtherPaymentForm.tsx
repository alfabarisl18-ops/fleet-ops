import { useEffect, useRef, useState } from 'react'
import { EXPENSE_LEDGER_CATEGORIES, INCOME_LEDGER_CATEGORIES, LEDGER_CATEGORY_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import { uploadDocument, validateDocumentFile } from '@/lib/documents'
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

  // Set only on a live (online) save — the id a receipt photo attaches
  // to. When the write went through the offline queue instead there's no
  // id yet, so the photo step is skipped with a message rather than
  // blocking the save on a connection the person doesn't have.
  const [savedLedgerEntryId, setSavedLedgerEntryId] = useState<string | null>(null)
  const [wasQueued, setWasQueued] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoAdded, setPhotoAdded] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

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
      const outcome = await recordOtherPayment({
        direction,
        amountMinor,
        category,
        applyDate,
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
        currentUserId,
      })
      if (outcome.status === 'saved') {
        setSavedLedgerEntryId(outcome.result)
      } else {
        setWasQueued(true)
      }
      setDone(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !savedLedgerEntryId) return

    const validationError = validateDocumentFile(file)
    if (validationError) {
      setPhotoError(validationError)
      return
    }

    setPhotoUploading(true)
    setPhotoError(null)
    try {
      await uploadDocument({
        ownerType: 'LEDGER_ENTRY',
        ownerId: savedLedgerEntryId,
        docType: 'RECEIPT',
        file,
        uploadedBy: currentUserId,
      })
      setPhotoAdded(true)
    } catch {
      setPhotoError('Could not upload this photo. Try again.')
    } finally {
      setPhotoUploading(false)
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

        {savedLedgerEntryId && !photoAdded && (
          <>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChosen} className="hidden" />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              className="rounded-2xl border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 active:bg-slate-50 disabled:opacity-50"
            >
              {photoUploading ? 'Uploading…' : '+ Add a photo of the receipt'}
            </button>
            {photoError && (
              <p role="alert" className="text-sm text-red-600">
                {photoError}
              </p>
            )}
          </>
        )}
        {photoAdded && <p className="text-sm text-emerald-600">Receipt photo added.</p>}
        {wasQueued && (
          <p className="text-sm text-slate-500">
            Saved without a receipt photo (no connection). It can still be attached later from the desktop Records screen.
          </p>
        )}

        <button
          type="button"
          onClick={onDone}
          className="mt-2 rounded-2xl bg-primary-600 px-6 py-3 text-base font-medium text-white"
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
        <div className="flex rounded-2xl border border-slate-300 p-1">
          <button
            type="button"
            onClick={() => switchDirection('INCOME')}
            className={`flex-1 rounded-xl py-3 text-base font-medium ${
              direction === 'INCOME' ? 'bg-primary-600 text-white' : 'text-slate-700'
            }`}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => switchDirection('EXPENSE')}
            className={`flex-1 rounded-xl py-3 text-base font-medium ${
              direction === 'EXPENSE' ? 'bg-primary-600 text-white' : 'text-slate-700'
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
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
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
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base"
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
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
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
          className="mt-2 rounded-2xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Done'}
        </button>
      </form>
    </div>
  )
}
