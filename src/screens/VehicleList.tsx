import { useEffect, useState } from 'react'
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import type { VehicleListItem, VehicleStatus } from '@/data/vehicles'
import { fetchVehicles, summarizeVehicles } from '@/data/vehicles'

interface VehicleListProps {
  onOpenVehicle: (vehicleId: string) => void
  onAddVehicle: () => void
}

// Colour is never the only channel (CLAUDE.md / accessibility rule): each
// light pairs with the exact status word next to it, not colour alone.
const STATUS_DOT_CLASS: Record<VehicleStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  GROUNDED: 'bg-red-500',
  IN_MAINTENANCE: 'bg-amber-500',
  ARCHIVED: 'bg-slate-400',
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
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Vehicles</h1>
        <button
          type="button"
          onClick={onAddVehicle}
          className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white active:bg-slate-800"
        >
          + Add Vehicle
        </button>
      </div>

      {summary && (
        <p className="mb-4 text-sm text-slate-600">
          {summary.total} vehicle{summary.total === 1 ? '' : 's'} — {summary.active} active, {summary.grounded}{' '}
          grounded, {summary.inMaintenance} in maintenance
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {vehicles === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {vehicles?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No vehicles yet. Add the first one to get started.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {vehicles?.map((vehicle) => (
          <li key={vehicle.id}>
            <button
              type="button"
              onClick={() => onOpenVehicle(vehicle.id)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
            >
              <span>
                <span className="block font-medium text-slate-900">{vehicle.fleetId}</span>
                <span className="block text-sm text-slate-500">
                  {VEHICLE_TYPE_LABELS[vehicle.type]}
                  {vehicle.plate ? ` · ${vehicle.plate}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASS[vehicle.status]}`} />
                {VEHICLE_STATUS_LABELS[vehicle.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
