import { useEffect, useState } from 'react'
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Future Purchases</h1>
        <button
          type="button"
          onClick={onOpenGoals}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
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
        <Card label="Active Purchase Goals" value={summary ? String(summary.activeGoals) : '…'} onClick={onOpenGoals} />
        <Card label="Amount Saved" value={summary ? formatMinorUnits(summary.amountSavedMinor) : '…'} onClick={onOpenGoals} />
        <Card label="Amount Still Required" value={summary ? formatMinorUnits(summary.amountStillRequiredMinor) : '…'} onClick={onOpenGoals} />
        <Card
          label="Vehicles Purchased"
          value={summary ? String(summary.vehiclesPurchased) : '…'}
          onClick={() => onOpenPlannedVehicles('PURCHASED', 'Vehicles purchased')}
        />
        <Card
          label="Vehicles in Transit"
          value={summary ? String(summary.vehiclesInTransit) : '…'}
          onClick={() => onOpenPlannedVehicles('IN_TRANSIT', 'Vehicles in transit')}
        />
        <Card
          label="Vehicles at Port"
          value={summary ? String(summary.vehiclesAtPort) : '…'}
          onClick={() => onOpenPlannedVehicles('AT_PORT', 'Vehicles at port')}
        />
        <Card
          label="Ready for Onboarding"
          value={summary ? String(summary.readyForOnboarding) : '…'}
          onClick={() => onOpenPlannedVehicles('READY_FOR_ONBOARDING', 'Ready for onboarding')}
        />
        <Card
          label="Overdue Purchase Actions"
          value={summary ? String(summary.overduePurchaseActions) : '…'}
          negative={summary ? summary.overduePurchaseActions > 0 : false}
          onClick={onOpenOverdueActions}
        />
      </div>
    </div>
  )
}

function Card({ label, value, negative, onClick }: { label: string; value: string; negative?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-300 bg-white px-4 py-4 text-left shadow-sm active:bg-slate-50"
    >
      <span className="block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`mt-1 block text-lg font-semibold ${negative ? 'text-red-600' : 'text-slate-900'}`}>{value}</span>
    </button>
  )
}
