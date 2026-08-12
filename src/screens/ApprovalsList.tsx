import { useEffect, useState } from 'react'
import { LEDGER_CATEGORY_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { AppRole } from '@/data/auth'
import type { TransactionListItem } from '@/data/accounting'
import { approveFlaggedExpense, fetchPendingApprovals } from '@/data/accounting'

interface ApprovalsListProps {
  currentUserRole: AppRole
  onBack: () => void
}

/**
 * SPEC: "Only unusual or disputed expenses require Fleet Manager
 * approval." The Approve action only renders for Fleet Manager (UI
 * convenience, same pattern as CorrectionPanel's role gate) — the real
 * boundary is approve_flagged_expense's own role check.
 */
export function ApprovalsList({ currentUserRole, onBack }: ApprovalsListProps) {
  const [items, setItems] = useState<TransactionListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchPendingApprovals()
      .then((i) => {
        if (!cancelled) setItems(i)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load approvals. Check your connection and try again.')
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
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Approvals</h1>
      <p className="mb-4 text-sm text-slate-500">Expenses flagged unusual or disputed</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {items === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {items?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nothing needs approval right now.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items?.map((item) => (
          <ApprovalRow key={item.id} item={item} currentUserRole={currentUserRole} onApproved={() => setReloadKey((k) => k + 1)} />
        ))}
      </ul>
    </div>
  )
}

function ApprovalRow({
  item,
  currentUserRole,
  onApproved,
}: {
  item: TransactionListItem
  currentUserRole: AppRole
  onApproved: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function approve() {
    setSubmitting(true)
    setError(null)
    try {
      await approveFlaggedExpense(item.id)
      onApproved()
    } catch {
      setError('Could not approve. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-slate-900">
          {item.vehicleFleetId ? `${item.vehicleFleetId} — ` : ''}
          {LEDGER_CATEGORY_LABELS[item.category]}
        </span>
        <span className="text-slate-900">{formatMinorUnits(-item.amountMinor)}</span>
      </div>
      <p className="mb-2 text-sm text-slate-500">
        {item.appliesToDate} ·{' '}
        <span className={item.approvalStatus === 'DISPUTED' ? 'text-red-600' : 'text-amber-700'}>
          {item.approvalStatus === 'DISPUTED' ? 'Disputed' : 'Unusual'}
        </span>
      </p>

      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {currentUserRole === 'FLEET_MANAGER' ? (
        <button
          type="button"
          onClick={approve}
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Approving…' : 'Approve'}
        </button>
      ) : (
        <p className="text-xs text-slate-400">Waiting on Fleet Manager approval.</p>
      )}
    </li>
  )
}
