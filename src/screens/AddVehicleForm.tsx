import { useEffect, useState } from 'react'
import { VEHICLE_TYPE_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { RouteOption, VehicleType } from '@/data/vehicles'
import { createVehicle, fetchRoutes } from '@/data/vehicles'

interface AddVehicleFormProps {
  onCreated: (vehicleId: string) => void
  onCancel: () => void
}

const VEHICLE_TYPES = Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]

/**
 * Fields per SPEC section 4's Vehicles workspace, minus photo (Storage
 * integration, out of scope this phase — see docs/log.md) and minus
 * "commercial purpose" (no such column exists in Phase 1's schema; flagged
 * as a real SPEC/schema gap in the Phase 3 plan rather than guessed at).
 */
export function AddVehicleForm({ onCreated, onCancel }: AddVehicleFormProps) {
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [fleetId, setFleetId] = useState('')
  const [type, setType] = useState<VehicleType>('SHORT_SPRINTER')
  const [customType, setCustomType] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [color, setColor] = useState('')
  const [plate, setPlate] = useState('')
  const [distinguishingMarks, setDistinguishingMarks] = useState('')
  const [routeId, setRouteId] = useState('')
  const [purchasedOn, setPurchasedOn] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [enteredServiceOn, setEnteredServiceOn] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRoutes()
      .then((r) => {
        if (!cancelled) setRoutes(r)
      })
      .catch(() => {
        /* Route picker just stays empty; not fatal to adding a vehicle. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const priceMinor = purchasePrice.trim() === '' ? null : parseMinorUnits(purchasePrice)
  const priceInvalid = purchasePrice.trim() !== '' && priceMinor === null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (fleetId.trim() === '') {
      setError('Fleet ID is required.')
      return
    }
    if (type === 'OTHER' && customType.trim() === '') {
      setError('Describe the vehicle type when Other is selected.')
      return
    }
    if (priceInvalid) {
      setError('Purchase price is not a valid amount.')
      return
    }

    setSubmitting(true)
    try {
      const id = await createVehicle({
        fleetId: fleetId.trim(),
        type,
        ...(type === 'OTHER' ? { customType: customType.trim() } : {}),
        ...(type === 'OTHER' && customDescription.trim() !== '' ? { customDescription: customDescription.trim() } : {}),
        ...(color.trim() !== '' ? { color: color.trim() } : {}),
        ...(plate.trim() !== '' ? { plate: plate.trim() } : {}),
        ...(distinguishingMarks.trim() !== '' ? { distinguishingMarks: distinguishingMarks.trim() } : {}),
        ...(routeId !== '' ? { routeId } : {}),
        ...(purchasedOn !== '' ? { purchasedOn } : {}),
        ...(priceMinor !== null ? { purchasePriceMinor: priceMinor } : {}),
        ...(enteredServiceOn !== '' ? { enteredServiceOn } : {}),
      })
      onCreated(id)
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

      <h1 className="mb-4 text-xl font-semibold text-slate-900">Add Vehicle</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Fleet ID</span>
          <input
            type="text"
            required
            value={fleetId}
            onChange={(e) => setFleetId(e.target.value)}
            placeholder="e.g. SPR-06"
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as VehicleType)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {VEHICLE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        {type === 'OTHER' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Describe the type</span>
              <input
                type="text"
                required
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                className="rounded-lg border border-slate-300 px-4 py-3 text-base"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Description (optional)</span>
              <textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                rows={2}
                className="rounded-lg border border-slate-300 px-4 py-3 text-base"
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Route (optional)</span>
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
          >
            <option value="">None</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Color (optional)</span>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Plate (optional)</span>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Distinguishing marks (optional)</span>
          <textarea
            value={distinguishingMarks}
            onChange={(e) => setDistinguishingMarks(e.target.value)}
            rows={2}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Purchase date (optional)</span>
          <input
            type="date"
            value={purchasedOn}
            onChange={(e) => setPurchasedOn(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Purchase price (optional)</span>
          <input
            type="text"
            inputMode="decimal"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            placeholder="0.00"
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
          {priceMinor !== null && purchasePrice.trim() !== '' && (
            <span className="text-xs text-slate-500">{formatMinorUnits(priceMinor)}</span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Service entry date (optional)</span>
          <input
            type="date"
            value={enteredServiceOn}
            onChange={(e) => setEnteredServiceOn(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Add vehicle'}
        </button>
      </form>
    </div>
  )
}
