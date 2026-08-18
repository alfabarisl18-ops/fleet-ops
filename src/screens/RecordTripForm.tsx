import { useEffect, useMemo, useState } from 'react'
import { WEIGHT_UNIT_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { WeightUnit } from '@/data/accounting'
import { recordTrip } from '@/data/accounting'
import type { DriverListItem } from '@/data/drivers'
import { fetchDrivers } from '@/data/drivers'
import { fetchVehicle } from '@/data/vehicles'

interface RecordTripFormProps {
  vehicleId: string
  fleetId: string
  onDone: () => void
  onBack: () => void
}

const WEIGHT_UNITS: WeightUnit[] = ['LB', 'KG']

/**
 * SPEC's Trips section, mobile entry screen — Collections & Finance,
 * under Sprinter & Box-Truck Payment → box truck selected. Exact 7-step
 * order: vehicle/driver → pickup/destination → dates (duration
 * calculates itself) → load → revenue → costs (each optional) → note.
 * One scrollable page rather than a 7-screen wizard, matching how this
 * app's other multi-field mobile forms (DayOutcomeForm) already work.
 */
export function RecordTripForm({ vehicleId, fleetId, onDone, onBack }: RecordTripFormProps) {
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null)
  const [driverId, setDriverId] = useState('')
  const [helperName, setHelperName] = useState('')
  const [pickupLocation, setPickupLocation] = useState('')
  const [destinationLocation, setDestinationLocation] = useState('')
  const [departedOn, setDepartedOn] = useState('')
  const [returnedOn, setReturnedOn] = useState('')
  const [loadQuantity, setLoadQuantity] = useState('')
  const [loadWeight, setLoadWeight] = useState('')
  const [loadWeightUnit, setLoadWeightUnit] = useState<WeightUnit>('KG')
  const [revenue, setRevenue] = useState('')
  const [checkpointCost, setCheckpointCost] = useState('')
  const [driverPay, setDriverPay] = useState('')
  const [helperPay, setHelperPay] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchDrivers(), fetchVehicle(vehicleId)])
      .then(([d, vehicle]) => {
        if (cancelled) return
        setDrivers(d)
        if (vehicle?.currentDriverId) setDriverId(vehicle.currentDriverId)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load drivers. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [vehicleId])

  const durationDays = useMemo(() => {
    if (departedOn === '' || returnedOn === '') return null
    // Both dates are UTC midnight, so the difference is always an exact
    // whole number of days already — no rounding needed (and money's
    // no-Math.round lint rule would flag it if there were).
    const start = new Date(`${departedOn}T00:00:00Z`)
    const end = new Date(`${returnedOn}T00:00:00Z`)
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) + 1
    return days > 0 ? days : null
  }, [departedOn, returnedOn])

  async function submit() {
    setError(null)

    if (departedOn === '') {
      setError('Enter a departure date.')
      return
    }
    const revenueMinor = revenue.trim() === '' ? 0 : parseMinorUnits(revenue)
    if (revenueMinor === null) {
      setError('Enter a valid revenue amount.')
      return
    }
    const checkpointMinor = checkpointCost.trim() === '' ? null : parseMinorUnits(checkpointCost)
    const driverPayMinor = driverPay.trim() === '' ? null : parseMinorUnits(driverPay)
    const helperPayMinor = helperPay.trim() === '' ? null : parseMinorUnits(helperPay)
    if (checkpointCost.trim() !== '' && checkpointMinor === null) {
      setError('Enter a valid checkpoint/road cost.')
      return
    }
    if (driverPay.trim() !== '' && driverPayMinor === null) {
      setError('Enter a valid driver pay amount.')
      return
    }
    if (helperPay.trim() !== '' && helperPayMinor === null) {
      setError('Enter a valid helper pay amount.')
      return
    }

    const quantity = loadQuantity.trim() === '' ? undefined : Number(loadQuantity)
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 0)) {
      setError('Enter a valid load quantity.')
      return
    }
    const weight = loadWeight.trim() === '' ? undefined : Number(loadWeight)
    if (weight !== undefined && (Number.isNaN(weight) || weight < 0)) {
      setError('Enter a valid load weight.')
      return
    }

    setSubmitting(true)
    try {
      await recordTrip({
        vehicleId,
        ...(driverId !== '' ? { driverId } : {}),
        ...(helperName.trim() !== '' ? { helperName: helperName.trim() } : {}),
        ...(pickupLocation.trim() !== '' ? { pickupLocation: pickupLocation.trim() } : {}),
        ...(destinationLocation.trim() !== '' ? { destinationLocation: destinationLocation.trim() } : {}),
        departedOn,
        ...(returnedOn !== '' ? { returnedOn } : {}),
        ...(quantity !== undefined ? { loadQuantity: quantity } : {}),
        ...(weight !== undefined ? { loadWeight: weight, loadWeightUnit } : {}),
        ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
        revenueMinor,
        expenses: [
          ...(checkpointMinor && checkpointMinor > 0 ? [{ category: 'ROAD_CHECKPOINT' as const, amountMinor: checkpointMinor }] : []),
          ...(driverPayMinor && driverPayMinor > 0 ? [{ category: 'DRIVER_OR_HELPER_PAYMENT' as const, amountMinor: driverPayMinor, note: 'Driver pay' }] : []),
          ...(helperPayMinor && helperPayMinor > 0 ? [{ category: 'DRIVER_OR_HELPER_PAYMENT' as const, amountMinor: helperPayMinor, note: 'Helper pay' }] : []),
        ],
      })
      onDone()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-4 text-lg font-semibold text-slate-900">{fleetId} — Trip</h1>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Driver</span>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            disabled={drivers === null}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base"
          >
            <option value="">Not set</option>
            {drivers?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Helper (optional)</span>
          <input
            type="text"
            value={helperName}
            onChange={(e) => setHelperName(e.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Pickup</span>
            <input
              type="text"
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Destination</span>
            <input
              type="text"
              value={destinationLocation}
              onChange={(e) => setDestinationLocation(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Departed</span>
            <input
              type="date"
              required
              value={departedOn}
              onChange={(e) => setDepartedOn(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Returned (optional)</span>
            <input
              type="date"
              value={returnedOn}
              onChange={(e) => setReturnedOn(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>
        </div>
        {durationDays !== null && <p className="text-xs text-slate-500">{durationDays} day(s)</p>}

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Load quantity</span>
            <input
              type="number"
              min={0}
              value={loadQuantity}
              onChange={(e) => setLoadQuantity(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Weight</span>
            <input
              type="text"
              inputMode="decimal"
              value={loadWeight}
              onChange={(e) => setLoadWeight(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Unit</span>
            <select
              value={loadWeightUnit}
              onChange={(e) => setLoadWeightUnit(e.target.value as WeightUnit)}
              className="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-base"
            >
              {WEIGHT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {WEIGHT_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Revenue received</span>
          <input
            type="text"
            inputMode="decimal"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder="0.00"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
          />
          {revenue.trim() !== '' && parseMinorUnits(revenue) !== null && (
            <span className="text-xs text-slate-500">{formatMinorUnits(parseMinorUnits(revenue) as number)}</span>
          )}
        </label>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Costs for the trip (optional)</p>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Checkpoint / road</span>
              <input
                type="text"
                inputMode="decimal"
                value={checkpointCost}
                onChange={(e) => setCheckpointCost(e.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Driver pay</span>
              <input
                type="text"
                inputMode="decimal"
                value={driverPay}
                onChange={(e) => setDriverPay(e.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Helper pay</span>
              <input
                type="text"
                inputMode="decimal"
                value={helperPay}
                onChange={(e) => setHelperPay(e.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
              />
            </label>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Note (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-2xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  )
}
