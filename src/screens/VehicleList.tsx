import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import type { VehicleListItem, VehicleStatus } from '@/data/vehicles'
import { fetchVehicles, summarizeVehicles } from '@/data/vehicles'

interface VehicleListProps {
  onOpenVehicle: (vehicleId: string) => void
  onAddVehicle: () => void
}

// Colour is never the only channel (CLAUDE.md / accessibility rule): each
// dot/pill pairs with the exact status word next to it, not colour alone.
const STATUS_DOT_CLASS: Record<VehicleStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  GROUNDED: 'bg-red-500',
  IN_MAINTENANCE: 'bg-amber-500',
  ARCHIVED: 'bg-slate-400',
}
const STATUS_PILL_CLASS: Record<VehicleStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  GROUNDED: 'bg-red-50 text-red-700',
  IN_MAINTENANCE: 'bg-amber-50 text-amber-700',
  ARCHIVED: 'bg-slate-100 text-slate-600',
}

export function VehicleList({ onOpenVehicle, onAddVehicle }: VehicleListProps) {
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchVehicles()
      .then((v) => {
        if (!cancelled) setVehicles(v)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load vehicles. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const summary = vehicles ? summarizeVehicles(vehicles) : null

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconChip section="vehicles" />
          <div>
            <h1 className="font-heading text-xl font-bold text-slate-900">Vehicles</h1>
            {summary && (
              <p className="text-sm text-slate-500">
                {summary.total} vehicle{summary.total === 1 ? '' : 's'} — {summary.active} active, {summary.grounded}{' '}
                grounded, {summary.inMaintenance} in maintenance
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onAddVehicle}
          className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white active:bg-primary-700"
        >
          + Add Vehicle
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {vehicles === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {vehicles?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No vehicles yet. Add the first one to get started.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {vehicles?.map((vehicle) => (
          <li key={vehicle.id}>
            <Card onClick={() => onOpenVehicle(vehicle.id)} className="flex w-full items-center justify-between">
              <span>
                <span className="block font-medium text-slate-900">{vehicle.fleetId}</span>
                <span className="block text-sm text-slate-500">
                  {VEHICLE_TYPE_LABELS[vehicle.type]}
                  {vehicle.plate ? ` · ${vehicle.plate}` : ''}
                </span>
              </span>
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_PILL_CLASS[vehicle.status]}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[vehicle.status]}`} />
                {VEHICLE_STATUS_LABELS[vehicle.status]}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
