import { useEffect, useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { LEDGER_CATEGORY_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { KnownExpenseRow, TransactionListItem } from '@/data/accounting'
import { fetchKnownExpenses, fetchRecentTransactions, flagLedgerEntry } from '@/data/accounting'

interface KnownExpensesScreenProps {
  onBack: () => void
}

/**
 * SPEC: "by category, showing where money leaves and what consumes the
 * most." Flagging a transaction unusual/disputed happens here, on the
 * transactions view — a desktop reviewer flags it after entry, per the
 * user's own confirmed scope decision, not whoever recorded it.
 */
export function KnownExpensesScreen({ onBack }: KnownExpensesScreenProps) {
  const [categories, setCategories] = useState<KnownExpenseRow[] | null>(null)
  const [transactions, setTransactions] = useState<TransactionListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchKnownExpenses(), fetchRecentTransactions(30)])
      .then(([c, tx]) => {
        if (cancelled) return
        setCategories(c)
        setTransactions(tx.filter((t) => t.direction === 'EXPENSE'))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load expenses. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const total = (categories ?? []).reduce((sum, c) => sum + c.totalMinor, 0)

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>
      <div className="mb-1 flex items-center gap-3">
        <IconChip section="accounting" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Known Expenses</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">This month, by category</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {categories === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="mb-6 flex flex-col gap-1">
        {categories?.map((c) => (
          <div key={c.category} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-slate-900">{LEDGER_CATEGORY_LABELS[c.category]}</span>
              <span className="text-slate-700">{formatMinorUnits(-c.totalMinor)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-slate-700" style={{ width: `${total > 0 ? (c.totalMinor / total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent expenses</h2>
      <ul className="flex flex-col gap-2">
        {transactions?.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} onFlagged={() => setReloadKey((k) => k + 1)} />
        ))}
      </ul>
    </div>
  )
}

function TransactionRow({ tx, onFlagged }: { tx: TransactionListItem; onFlagged: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function flag(status: 'PENDING' | 'DISPUTED') {
    setSubmitting(true)
    setError(null)
    try {
      await flagLedgerEntry(tx.id, status)
      onFlagged()
    } catch {
      setError('Could not flag this transaction. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700">
          {tx.vehicleFleetId ? `${tx.vehicleFleetId} — ` : ''}
          {LEDGER_CATEGORY_LABELS[tx.category]}
        </span>
        <span className="text-slate-900">{formatMinorUnits(-tx.amountMinor)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">{tx.appliesToDate}</span>
        {tx.approvalStatus === 'NOT_REQUIRED' ? (
          <span className="flex gap-3">
            <button type="button" disabled={submitting} onClick={() => flag('PENDING')} className="text-xs font-medium text-amber-700 disabled:opacity-50">
              Flag unusual
            </button>
            <button type="button" disabled={submitting} onClick={() => flag('DISPUTED')} className="text-xs font-medium text-red-600 disabled:opacity-50">
              Dispute
            </button>
          </span>
        ) : (
          <span className={`text-xs font-medium ${tx.approvalStatus === 'APPROVED' ? 'text-emerald-700' : 'text-amber-700'}`}>
            {tx.approvalStatus === 'PENDING' ? 'Unusual — pending' : tx.approvalStatus === 'DISPUTED' ? 'Disputed' : 'Approved'}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </li>
  )
}
