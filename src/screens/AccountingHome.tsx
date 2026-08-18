import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { formatMinorUnits } from '@/lib/money'
import type { LedgerSummary, TransactionListItem } from '@/data/accounting'
import {
  fetchBackdatedCount,
  fetchKnownExpenses,
  fetchLedgerSummary,
  fetchOwedByBusiness,
  fetchOwedToBusiness,
  fetchRecentTransactions,
  fetchUnreconciledCount,
} from '@/data/accounting'

interface AccountingHomeProps {
  onOpenSprinterIncome: () => void
  onOpenTruckIncome: () => void
  onOpenKnownExpenses: () => void
  onOpenApprovals: () => void
  onOpenFlaggedDuplicates: () => void
}

/**
 * SPEC section 4's Accounting: three summary cards (Sprinter Income,
 * Truck Income, Known Expenses — each "clickable," opening its own
 * screen), the ledger split (recent transactions + income/expense
 * summary), amounts owed to/by the business, backdated entries,
 * reconciliation status, profit/loss. Current month by default.
 */
export function AccountingHome({
  onOpenSprinterIncome,
  onOpenTruckIncome,
  onOpenKnownExpenses,
  onOpenApprovals,
  onOpenFlaggedDuplicates,
}: AccountingHomeProps) {
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [transactions, setTransactions] = useState<TransactionListItem[] | null>(null)
  const [owedTo, setOwedTo] = useState<number | null>(null)
  const [owedBy, setOwedBy] = useState<number | null>(null)
  const [backdated, setBackdated] = useState<number | null>(null)
  const [unreconciled, setUnreconciled] = useState<number | null>(null)
  const [knownExpensesTotal, setKnownExpensesTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchLedgerSummary(),
      fetchRecentTransactions(8),
      fetchOwedToBusiness(),
      fetchOwedByBusiness(),
      fetchBackdatedCount(),
      fetchUnreconciledCount(),
      fetchKnownExpenses(),
    ])
      .then(([s, tx, to, by, bd, unrec, expenses]) => {
        if (cancelled) return
        setSummary(s)
        setTransactions(tx)
        setOwedTo(to)
        setOwedBy(by)
        setBackdated(bd)
        setUnreconciled(unrec)
        setKnownExpensesTotal(expenses.reduce((sum, e) => sum + e.totalMinor, 0))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load accounting data. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconChip section="accounting" />
          <h1 className="font-heading text-xl font-bold text-slate-900">Accounting</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenFlaggedDuplicates}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
          >
            Flagged duplicates
          </button>
          <button
            type="button"
            onClick={onOpenApprovals}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
          >
            Approvals
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card onClick={onOpenSprinterIncome}>
          <IconChip section="vehicles" className="mb-3" />
          <span className="font-heading block text-base font-semibold text-slate-900">Sprinter Income</span>
          <span className="mt-1 block text-sm text-slate-500">Expected vs. collected, by vehicle</span>
        </Card>

        <Card onClick={onOpenTruckIncome}>
          <IconChip section="vehicles" className="mb-3" />
          <span className="font-heading block text-base font-semibold text-slate-900">Truck Income</span>
          <span className="mt-1 block text-sm text-slate-500">Trips, revenue, and net</span>
        </Card>

        <Card onClick={onOpenKnownExpenses}>
          <IconChip section="accounting" className="mb-3" />
          <span className="font-heading block text-base font-semibold text-slate-900">Known Expenses</span>
          <span className="mt-1 block text-sm text-slate-500">
            {knownExpensesTotal !== null ? formatMinorUnits(-knownExpensesTotal) : '…'} this month
          </span>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Income (month)" value={summary ? formatMinorUnits(summary.incomeMinor) : '…'} />
        <SummaryCard label="Expenses (month)" value={summary ? formatMinorUnits(-summary.expenseMinor) : '…'} />
        <SummaryCard
          label="Profit / loss"
          value={summary ? formatMinorUnits(summary.profitLossMinor) : '…'}
          negative={summary ? summary.profitLossMinor < 0 : false}
        />
        <SummaryCard label="Owed to us" value={owedTo !== null ? formatMinorUnits(owedTo) : '…'} />
        <SummaryCard label="Owed by us" value={owedBy !== null ? formatMinorUnits(owedBy) : '…'} />
        <SummaryCard label="Unreconciled" value={unreconciled !== null ? String(unreconciled) : '…'} />
        <SummaryCard label="Backdated entries" value={backdated !== null ? String(backdated) : '…'} />
      </div>

      <Card title="Recent transactions">
        {transactions === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {transactions?.length === 0 && <p className="text-sm text-slate-500">No transactions yet.</p>}

        <ul className="flex flex-col gap-1">
          {transactions?.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-b-0">
              <span className="text-slate-700">
                {tx.vehicleFleetId ? `${tx.vehicleFleetId} — ` : ''}
                {tx.category.replaceAll('_', ' ').toLowerCase()}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-slate-400">{tx.appliesToDate}</span>
                <span className={tx.direction === 'EXPENSE' ? 'text-red-600' : 'text-emerald-700'}>
                  {tx.direction === 'EXPENSE' ? formatMinorUnits(-tx.amountMinor) : formatMinorUnits(tx.amountMinor)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function SummaryCard({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${negative ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
