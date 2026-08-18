import { useEffect, useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { VEHICLE_STATUS_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { DriverListItem } from '@/data/drivers'
import { fetchDrivers } from '@/data/drivers'
import type { RouteOption, VehicleStatus } from '@/data/vehicles'
import { fetchRoutes } from '@/data/vehicles'
import { onboardVehicle } from '@/data/futurePurchases'

interface OnboardVehicleFormProps {
  plannedVehicleId: string
  goalName: string
  onOnboarded: (vehicleId: string) => void
  onCancel: () => void
}

const STATUSES: VehicleStatus[] = ['ACTIVE', 'GROUNDED', 'IN_MAINTENANCE']

/**
 * SPEC: "Onboard Vehicle ... carries across everything already recorded —
 * type, make, model, ... landed cost ... Only operational details remain:
 * internal fleet ID, assigned driver and phone, route, expected daily
 * payment, yearly target, service entry date, initial maintenance
 * schedule, current status." Initial maintenance schedule isn't a field
 * anywhere in the Maintenance schema (orders are opened one at a time,
 * there's no "schedule" concept) — out of scope, same as the Phase 6 plan
 * treated it.
 */
export function OnboardVehicleForm({ plannedVehicleId, goalName, onOnboarded, onCancel }: OnboardVehicleFormProps) {
  const [drivers, setDrivers] = useState<DriverListItem[]>([])
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [fleetId, setFleetId] = useState('')
  const [plate, setPlate] = useState('')
  const [currentDriverId, setCurrentDriverId] = useState('')
  const [routeId, setRouteId] = useState('')
  const [expectedDailyAmount, setExpectedDailyAmount] = useState('')
  const [yearlyTarget, setYearlyTarget] = useState('')
  const [enteredServiceOn, setEnteredServiceOn] = useState('')
  const [status, setStatus] = useState<VehicleStatus>('ACTIVE')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchDrivers(), fetchRoutes()])
      .then(([d, r]) => {
        if (cancelled) return
        setDrivers(d.filter((driver) => driver.status === 'ACTIVE'))
        setRoutes(r)
      })
      .catch(() => {
        /* Driver/route pickers just stay empty; not fatal to onboarding. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dailyMinor = expectedDailyAmount.trim() === '' ? null : parseMinorUnits(expectedDailyAmount)
  const dailyInvalid = expectedDailyAmount.trim() !== '' && dailyMinor === null
  const yearlyMinor = yearlyTarget.trim() === '' ? null : parseMinorUnits(yearlyTarget)
  const yearlyInvalid = yearlyTarget.trim() !== '' && yearlyMinor === null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (fleetId.trim() === '') {
      setError('Fleet ID is required.')
      return
    }
    if (dailyInvalid || yearlyInvalid) {
      setError('Enter valid amounts for the daily and yearly targets.')
      return
    }

    setSubmitting(true)
    try {
      const vehicleId = await onboardVehicle({
        plannedVehicleId,
        fleetId: fleetId.trim(),
        ...(plate.trim() !== '' ? { plate: plate.trim() } : {}),
        ...(currentDriverId !== '' ? { currentDriverId } : {}),
        ...(routeId !== '' ? { routeId } : {}),
        expectedDailyAmountMinor: dailyMinor ?? 0,
        yearlyTargetMinor: yearlyMinor ?? 0,
        ...(enteredServiceOn !== '' ? { enteredServiceOn } : {}),
        status,
      })
      onOnboarded(vehicleId)
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      if (code === '23505') {
        setError('That fleet ID or plate is already in use by another vehicle.')
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-1 flex items-center gap-3">
        <IconChip section="vehicles" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Onboard vehicle</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        {goalName} — landed cost and acquisition history carry across automatically. Only operational details are needed here.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Fleet ID</span>
          <input
            type="text"
            required
            value={fleetId}
            onChange={(e) => setFleetId(e.target.value)}
            placeholder="e.g. SPR-06"
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Plate (optional)</span>
          <input type="text" value={plate} onChange={(e) => setPlate(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-base" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Assigned driver (optional)</span>
          <select value={currentDriverId} onChange={(e) => setCurrentDriverId(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
            <option value="">None yet</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Route (optional)</span>
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
            <option value="">None</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Expected daily amount</span>
            <input
              type="text"
              inputMode="decimal"
              value={expectedDailyAmount}
              onChange={(e) => setExpectedDailyAmount(e.target.value)}
              placeholder="0.00"
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            {dailyMinor !== null && expectedDailyAmount.trim() !== '' && <span className="text-xs text-slate-500">{formatMinorUnits(dailyMinor)}</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Yearly target</span>
            <input
              type="text"
              inputMode="decimal"
              value={yearlyTarget}
              onChange={(e) => setYearlyTarget(e.target.value)}
              placeholder="0.00"
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            {yearlyMinor !== null && yearlyTarget.trim() !== '' && <span className="text-xs text-slate-500">{formatMinorUnits(yearlyMinor)}</span>}
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Service entry date (optional)</span>
          <input type="date" value={enteredServiceOn} onChange={(e) => setEnteredServiceOn(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-base" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Current status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as VehicleStatus)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {VEHICLE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="mt-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50">
          {submitting ? 'Onboarding…' : 'Onboard vehicle'}
        </button>
      </form>
    </div>
  )
}
