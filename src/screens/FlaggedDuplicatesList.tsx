import { useEffect, useState } from 'react'
import { formatMinorUnits } from '@/lib/money'
import type { FlaggedDuplicatePayment } from '@/data/accounting'
import { fetchFlaggedDuplicatePayments, resolveFlaggedDuplicatePayment } from '@/data/accounting'

interface FlaggedDuplicatesListProps {
  currentUserId: string
  onBack: () => void
}

/**
 * SPEC section 8: "Two collectors recording the same vehicle-day is
 * caught by the unique index and becomes a flagged duplicate for
 * review, never a silent overwrite." The submission that lost the race
 * lands here for a desktop reviewer — SPEC says "for review," not "for
 * automatic reconciliation," so the only action is dismissing it once
 * looked at; no merge/apply exists.
 */
export function FlaggedDuplicatesList({ currentUserId, onBack }: FlaggedDuplicatesListProps) {
  const [items, setItems] = useState<FlaggedDuplicatePayment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchFlaggedDuplicatePayments()
      .then((i) => {
        if (!cancelled) setItems(i)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load flagged duplicates. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Flagged duplicates</h1>
      <p className="mb-4 text-sm text-slate-500">Two submissions for the same vehicle-day</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {items === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {items?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No flagged duplicates right now.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items?.map((item) => (
          <DuplicateRow key={item.id} item={item} currentUserId={currentUserId} onResolved={() => setReloadKey((k) => k + 1)} />
        ))}
      </ul>
    </div>
  )
}

function DuplicateRow({
  item,
  currentUserId,
  onResolved,
}: {
  item: FlaggedDuplicatePayment
  currentUserId: string
  onResolved: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function dismiss() {
    setSubmitting(true)
    setError(null)
    try {
      await resolveFlaggedDuplicatePayment(item.id, currentUserId)
      onResolved()
    } catch {
      setError('Could not dismiss. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const payload = item.payload as { dayOutcome?: string; receivedAmountMinor?: number } | null

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-slate-900">
          {item.vehicleFleetId} — {item.serviceDate}
        </span>
        {payload?.receivedAmountMinor !== undefined && (
          <span className="text-slate-900">{formatMinorUnits(payload.receivedAmountMinor)}</span>
        )}
      </div>
      <p className="mb-2 text-sm text-slate-500">
        {payload?.dayOutcome ?? 'Unknown outcome'} · submitted {item.submittedAt.slice(0, 10)}
      </p>

      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={dismiss}
        disabled={submitting}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        {submitting ? 'Dismissing…' : 'Dismiss'}
      </button>
    </li>
  )
}
