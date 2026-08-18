import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { formatMinorUnits } from '@/lib/money'
import type { FuturePurchasesSummary } from '@/data/futurePurchases'
import { fetchFuturePurchasesSummary } from '@/data/futurePurchases'

export type PlannedVehicleFilter = 'PURCHASED' | 'IN_TRANSIT' | 'AT_PORT' | 'READY_FOR_ONBOARDING'

interface FuturePurchasesHomeProps {
  onOpenGoals: () => void
  onOpenPlannedVehicles: (filter: PlannedVehicleFilter, title: string) => void
  onOpenOverdueActions: () => void
}

/**
 * SPEC section 4's own card list: "Active Purchase Goals, Amount Saved,
 * Amount Still Required, Vehicles Purchased, Vehicles in Transit, Vehicles
 * at Port, Ready for Onboarding, Overdue Purchase Actions." All eight are
 * clickable — the money cards open the goal list (where each goal breaks
 * its own saved/required down), the stage cards open a shared cross-goal
 * planned-vehicle list filtered to that stage group.
 */
export function FuturePurchasesHome({ onOpenGoals, onOpenPlannedVehicles, onOpenOverdueActions }: FuturePurchasesHomeProps) {
  const [summary, setSummary] = useState<FuturePurchasesSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchFuturePurchasesSummary()
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load Future Purchases. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconChip section="future-purchases" />
          <h1 className="font-heading text-xl font-bold text-slate-900">Future Purchases</h1>
        </div>
        <button
          type="button"
          onClick={onOpenGoals}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
        >
          + New purchase goal
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active Purchase Goals" value={summary ? String(summary.activeGoals) : '…'} onClick={onOpenGoals} />
        <StatCard label="Amount Saved" value={summary ? formatMinorUnits(summary.amountSavedMinor) : '…'} onClick={onOpenGoals} />
        <StatCard label="Amount Still Required" value={summary ? formatMinorUnits(summary.amountStillRequiredMinor) : '…'} onClick={onOpenGoals} />
        <StatCard
          label="Vehicles Purchased"
          value={summary ? String(summary.vehiclesPurchased) : '…'}
          onClick={() => onOpenPlannedVehicles('PURCHASED', 'Vehicles purchased')}
        />
        <StatCard
          label="Vehicles in Transit"
          value={summary ? String(summary.vehiclesInTransit) : '…'}
          onClick={() => onOpenPlannedVehicles('IN_TRANSIT', 'Vehicles in transit')}
        />
        <StatCard
          label="Vehicles at Port"
          value={summary ? String(summary.vehiclesAtPort) : '…'}
          onClick={() => onOpenPlannedVehicles('AT_PORT', 'Vehicles at port')}
        />
        <StatCard
          label="Ready for Onboarding"
          value={summary ? String(summary.readyForOnboarding) : '…'}
          onClick={() => onOpenPlannedVehicles('READY_FOR_ONBOARDING', 'Ready for onboarding')}
        />
        <StatCard
          label="Overdue Purchase Actions"
          value={summary ? String(summary.overduePurchaseActions) : '…'}
          negative={summary ? summary.overduePurchaseActions > 0 : false}
          onClick={onOpenOverdueActions}
        />
      </div>
    </div>
  )
}

function StatCard({ label, value, negative, onClick }: { label: string; value: string; negative?: boolean; onClick: () => void }) {
  return (
    <Card onClick={onClick}>
      <span className="block text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</span>
      <span className={`mt-1 block text-lg font-semibold ${negative ? 'text-red-600' : 'text-slate-900'}`}>{value}</span>
    </Card>
  )
}
