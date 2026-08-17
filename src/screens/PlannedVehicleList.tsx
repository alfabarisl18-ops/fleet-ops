import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { PURCHASE_STAGE_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import type { PlannedVehicleAcrossGoals, PurchaseStage } from '@/data/futurePurchases'
import { fetchPlannedVehiclesByStages } from '@/data/futurePurchases'
import type { PlannedVehicleFilter } from '@/screens/FuturePurchasesHome'

interface PlannedVehicleListProps {
  filter: PlannedVehicleFilter
  title: string
  onBack: () => void
  onOpenPlannedVehicle: (id: string) => void
}

const PURCHASED_STAGES: PurchaseStage[] = [
  'DEPOSIT_PAID',
  'FULLY_PURCHASED',
  'AWAITING_SHIPMENT',
  'IN_TRANSIT',
  'ARRIVED_AT_PORT',
  'CUSTOMS_CLEARING',
  'TRANSPORTING_FROM_PORT',
  'INSPECTION_AND_REGISTRATION',
  'READY_FOR_ONBOARDING',
  'ACTIVE_IN_SERVICE',
]

const STAGES_FOR_FILTER: Record<PlannedVehicleFilter, PurchaseStage[]> = {
  PURCHASED: PURCHASED_STAGES,
  IN_TRANSIT: ['IN_TRANSIT'],
  AT_PORT: ['ARRIVED_AT_PORT', 'CUSTOMS_CLEARING'],
  READY_FOR_ONBOARDING: ['READY_FOR_ONBOARDING'],
}

/** Backs 4 of Future Purchases Home's 8 cards — one shared cross-goal list,
 *  filtered by which stage group the card names. */
export function PlannedVehicleList({ filter, title, onBack, onOpenPlannedVehicle }: PlannedVehicleListProps) {
  const [items, setItems] = useState<PlannedVehicleAcrossGoals[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPlannedVehiclesByStages(STAGES_FOR_FILTER[filter])
      .then((r) => {
        if (!cancelled) setItems(r)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load vehicles. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [filter])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm font-medium text-slate-500">
        ← Back
      </button>

      <div className="mb-6 flex items-center gap-3">
        <IconChip section="future-purchases" />
        <h1 className="font-heading text-xl font-bold text-slate-900">{title}</h1>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {items === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {items?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nothing here right now.</p>
      )}

      <ul className="flex flex-col gap-2">
        {items?.map((item) => (
          <li key={item.id}>
            <Card onClick={() => onOpenPlannedVehicle(item.id)} className="flex w-full items-center justify-between">
              <span>
                <span className="block font-medium text-slate-900">
                  {item.goalName} — Candidate #{item.sequence}
                </span>
                <span className="block text-sm text-slate-500">{VEHICLE_TYPE_LABELS[item.goalVehicleType]}</span>
              </span>
              <span className="text-sm text-slate-600">{PURCHASE_STAGE_LABELS[item.stage]}</span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
