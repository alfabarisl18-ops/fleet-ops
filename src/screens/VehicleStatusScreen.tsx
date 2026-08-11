import { useEffect, useState } from 'react'
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import type { VehicleListItem, VehicleStatus, VehicleType } from '@/data/vehicles'
import { changeVehicleStatus, fetchVehicles } from '@/data/vehicles'

interface VehicleStatusScreenProps {
  currentUserId: string
  onDone: () => void
}

const STATUS_ORDER: VehicleStatus[] = ['ACTIVE', 'GROUNDED', 'IN_MAINTENANCE']

/**
 * Mobile quick action for Maintenance & Repairs — SPEC lists "vehicle
 * status" as its own capability, reachable without opening a maintenance
 * record first. Reuses changeVehicleStatus directly (Phase 6 plan), same
 * function VehicleProfileScreen's desktop StatusControl already calls.
 */
export function VehicleStatusScreen({ currentUserId, onDone }: VehicleStatusScreenProps) {
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)
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

  if (vehicleId) {
    const vehicle = vehicles?.find((v) => v.id === vehicleId)
    if (vehicle) {
      return (
        <StatusForm
          vehicle={vehicle}
          currentUserId={currentUserId}
          onDone={onDone}
          onBack={() => setVehicleId(null)}
        />
      )
    }
  }

  const grouped = new Map<VehicleType, VehicleListItem[]>()
  for (const v of vehicles ?? []) {
    const list = grouped.get(v.type) ?? []
    list.push(v)
    grouped.set(v.type, list)
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onDone} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-4 text-lg font-semibold text-slate-900">Vehicle status</h1>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {vehicles === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {[...grouped.entries()].map(([type, list]) => (
        <div key={type} className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{VEHICLE_TYPE_LABELS[type]}</h2>
          <ul className="flex flex-col gap-2">
            {list.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setVehicleId(v.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-4 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
                >
                  <span>
                    {v.fleetId}
                    {v.plate ? <span className="ml-2 text-sm font-normal text-slate-500">{v.plate}</span> : null}
                  </span>
                  <span className="text-sm font-normal text-slate-500">{VEHICLE_STATUS_LABELS[v.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function StatusForm({
  vehicle,
  currentUserId,
  onDone,
  onBack,
}: {
  vehicle: VehicleListItem
  currentUserId: string
  onDone: () => void
  onBack: () => void
}) {
  const [target, setTarget] = useState<VehicleStatus | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!target) return
    if (reason.trim() === '') {
      setError('A reason is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await changeVehicleStatus(vehicle.id, target, reason.trim(), currentUserId)
      onDone()
    } catch {
      setError('Could not change status. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-1 text-lg font-semibold text-slate-900">{vehicle.fleetId}</h1>
      <p className="mb-4 text-sm text-slate-500">
        Current: <span className="font-medium text-slate-700">{VEHICLE_STATUS_LABELS[vehicle.status]}</span>
      </p>

      {!target && (
        <div className="flex flex-col gap-2">
          {STATUS_ORDER.filter((s) => s !== vehicle.status).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTarget(s)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
            >
              Move to {VEHICLE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {target && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            Change status to <span className="font-medium">{VEHICLE_STATUS_LABELS[target]}</span>
          </p>
          <input
            type="text"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTarget(null)
                setError(null)
              }}
              className="rounded-lg border border-slate-300 px-6 py-3 text-base font-medium text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
