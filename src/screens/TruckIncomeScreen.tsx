import { useEffect, useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { TRIP_STATUS_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { TripListItem } from '@/data/accounting'
import { fetchTruckIncome } from '@/data/accounting'

interface TruckIncomeScreenProps {
  onBack: () => void
}

/**
 * SPEC: "income by truck, trip revenue, direct trip costs, net trip
 * contribution, comparison between trucks." Net is never stored —
 * revenue minus linked expenses, computed the same way here as on the
 * vehicle profile, so the two never disagree.
 */
export function TruckIncomeScreen({ onBack }: TruckIncomeScreenProps) {
  const [trips, setTrips] = useState<TripListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTruckIncome()
      .then((t) => {
        if (!cancelled) setTrips(t)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load Truck income. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const totalNet = (trips ?? []).reduce((sum, t) => sum + t.netMinor, 0)

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>
      <div className="mb-1 flex items-center gap-3">
        <IconChip section="vehicles" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Truck Income</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">Every trip's net — revenue minus linked costs</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {trips === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {trips?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No trips recorded yet. Trips are recorded on the mobile Collections & Finance screen, under Vehicle Payment
          → a box truck selected.
        </p>
      )}

      {trips && trips.length > 0 && (
        <p className="mb-4 text-sm font-medium text-slate-700">
          Total net across {trips.length} trip{trips.length === 1 ? '' : 's'}: {formatMinorUnits(totalNet)}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {trips?.map((t) => (
          <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-slate-900">{t.fleetId}</span>
              <span className={`font-medium ${t.netMinor < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMinorUnits(t.netMinor)}</span>
            </div>
            <p className="text-sm text-slate-500">
              {t.pickupLocation ?? '—'} → {t.destinationLocation ?? '—'} · {t.departedOn ?? '—'}
              {t.returnedOn ? ` – ${t.returnedOn}` : ''}
            </p>
            <p className="text-xs text-slate-400">
              {TRIP_STATUS_LABELS[t.status]} · Revenue {formatMinorUnits(t.revenueMinor)} · Costs {formatMinorUnits(t.expenseMinor)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
