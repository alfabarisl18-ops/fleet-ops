import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { PURCHASE_GOAL_STATUS_LABELS, PURCHASE_PRIORITY_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { PurchaseGoalListItem } from '@/data/futurePurchases'
import { fetchPurchaseGoals } from '@/data/futurePurchases'

interface PurchaseGoalListProps {
  onOpenGoal: (goalId: string) => void
  onAddGoal: () => void
}

export function PurchaseGoalList({ onOpenGoal, onAddGoal }: PurchaseGoalListProps) {
  const [goals, setGoals] = useState<PurchaseGoalListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPurchaseGoals()
      .then((g) => {
        if (!cancelled) setGoals(g)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load purchase goals. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconChip section="future-purchases" />
          <h1 className="font-heading text-xl font-bold text-slate-900">Purchase goals</h1>
        </div>
        <button
          type="button"
          onClick={onAddGoal}
          className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white active:bg-primary-700"
        >
          + New purchase goal
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {goals === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {goals?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No purchase goals yet. Start one to begin saving toward a vehicle.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {goals?.map((goal) => {
          const percent = goal.budgetMinor ? Math.min(Math.trunc((goal.savedMinor / goal.budgetMinor) * 100), 100) : null
          return (
            <li key={goal.id}>
              <Card onClick={() => onOpenGoal(goal.id)} className="flex w-full items-center justify-between">
                <span>
                  <span className="block font-medium text-slate-900">
                    {goal.name}
                    {goal.priority === 'HIGH' && <span aria-hidden="true" className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500" />}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {PURCHASE_GOAL_STATUS_LABELS[goal.status]} · {PURCHASE_PRIORITY_LABELS[goal.priority]} priority
                    {goal.targetPurchaseDate ? ` · target ${goal.targetPurchaseDate}` : ''}
                  </span>
                </span>
                <span className="text-right text-sm text-slate-600">
                  {goal.budgetMinor !== null ? (
                    <>
                      <span className="block">{formatMinorUnits(goal.savedMinor)} saved</span>
                      <span className="block text-slate-400">{percent}% of {formatMinorUnits(goal.budgetMinor)}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">No savings target set</span>
                  )}
                </span>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
