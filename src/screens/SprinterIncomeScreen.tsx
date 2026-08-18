import { useEffect, useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { formatMinorUnits } from '@/lib/money'
import type { SprinterIncomeRow } from '@/data/accounting'
import { fetchSprinterIncome } from '@/data/accounting'

interface SprinterIncomeScreenProps {
  onBack: () => void
  onOpenVehicle: (vehicleId: string) => void
}

/**
 * SPEC: "income by Sprinter, comparison across vehicles, highest and
 * lowest performers, expected vs collected, missing payments and
 * balances." Every non-box-truck vehicle — the same rule
 * isDayOutcomeEligible already encodes.
 */
export function SprinterIncomeScreen({ onBack, onOpenVehicle }: SprinterIncomeScreenProps) {
  const [rows, setRows] = useState<SprinterIncomeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSprinterIncome()
      .then((r) => {
        if (!cancelled) setRows([...r].sort((a, b) => b.collectedMinor - a.collectedMinor))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load Sprinter income. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>
      <div className="mb-1 flex items-center gap-3">
        <IconChip section="vehicles" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Sprinter Income</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">Expected vs. collected this month, highest performer first</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {rows === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-slate-500">No Sprinter-type vehicles yet.</p>}

      <ul className="flex flex-col gap-2">
        {rows?.map((r) => (
          <li key={r.vehicleId}>
            <button
              type="button"
              onClick={() => onOpenVehicle(r.vehicleId)}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-slate-900">{r.fleetId}</span>
                <span className="text-sm text-slate-500">
                  {formatMinorUnits(r.collectedMinor)} of {formatMinorUnits(r.expectedMinor)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${r.collectedMinor >= r.expectedMinor ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${r.expectedMinor > 0 ? Math.min(100, (r.collectedMinor / r.expectedMinor) * 100) : 100}%` }}
                />
              </div>
              {(r.missingMinor > 0 || r.owedByDriverMinor > 0) && (
                <p className="mt-2 text-xs text-slate-500">
                  {r.missingMinor > 0 && <span>{formatMinorUnits(r.missingMinor)} missing this month</span>}
                  {r.missingMinor > 0 && r.owedByDriverMinor > 0 && ' · '}
                  {r.owedByDriverMinor > 0 && <span>Driver balance {formatMinorUnits(r.owedByDriverMinor)}</span>}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
