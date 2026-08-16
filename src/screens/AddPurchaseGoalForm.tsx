import { useState } from 'react'
import {
  FUEL_TYPE_LABELS,
  PURCHASE_PRIORITY_LABELS,
  TRANSMISSION_TYPE_LABELS,
  VEHICLE_CONDITION_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { FuelType, PurchasePriority, TransmissionType, VehicleCondition } from '@/data/futurePurchases'
import { createPurchaseGoal, setSavingsTarget } from '@/data/futurePurchases'
import type { VehicleType } from '@/data/vehicles'

interface AddPurchaseGoalFormProps {
  currentUserId: string
  onCreated: (goalId: string) => void
  onCancel: () => void
}

const VEHICLE_TYPES = Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]
const PRIORITIES = Object.keys(PURCHASE_PRIORITY_LABELS) as PurchasePriority[]
const CONDITIONS = Object.keys(VEHICLE_CONDITION_LABELS) as VehicleCondition[]
const FUEL_TYPES = Object.keys(FUEL_TYPE_LABELS) as FuelType[]
const TRANSMISSIONS = Object.keys(TRANSMISSION_TYPE_LABELS) as TransmissionType[]

/**
 * SPEC section 4: "Purchase goals capture name, vehicle type, number
 * required, new or used, make, model, year, color, fuel, transmission,
 * market country, seller, intended route, target purchase date, expected
 * arrival, priority, notes, and supporting documents." Route and documents
 * are handled on the goal detail screen (a route picker needs the goal to
 * exist first, and documents need a real owner_id to upload against).
 * A budget here also creates the savings target in one step, since SPEC
 * treats "goal" and "target" as one idea on the purchase card — the fuller
 * savings-target fields (weekly/monthly, minimum reserves) stay on the
 * detail screen's own panel.
 */
export function AddPurchaseGoalForm({ currentUserId, onCreated, onCancel }: AddPurchaseGoalFormProps) {
  const [name, setName] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('SHORT_SPRINTER')
  const [customType, setCustomType] = useState('')
  const [vehiclesRequired, setVehiclesRequired] = useState('1')
  const [condition, setCondition] = useState<VehicleCondition | ''>('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [modelYear, setModelYear] = useState('')
  const [color, setColor] = useState('')
  const [fuelType, setFuelType] = useState<FuelType | ''>('')
  const [transmission, setTransmission] = useState<TransmissionType | ''>('')
  const [marketCountry, setMarketCountry] = useState('')
  const [seller, setSeller] = useState('')
  const [targetPurchaseDate, setTargetPurchaseDate] = useState('')
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('')
  const [priority, setPriority] = useState<PurchasePriority>('MEDIUM')
  const [notes, setNotes] = useState('')
  const [budget, setBudget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiredCount = Number(vehiclesRequired)
  const requiredInvalid = !Number.isInteger(requiredCount) || requiredCount < 1

  const budgetMinor = budget.trim() === '' ? null : parseMinorUnits(budget)
  const budgetInvalid = budget.trim() !== '' && budgetMinor === null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (name.trim() === '') {
      setError('Give this goal a name.')
      return
    }
    if (vehicleType === 'OTHER' && customType.trim() === '') {
      setError('Describe the vehicle type when Other is selected.')
      return
    }
    if (requiredInvalid) {
      setError('Number of vehicles required must be a whole number of at least 1.')
      return
    }
    if (budgetInvalid) {
      setError('Budget is not a valid amount.')
      return
    }

    setSubmitting(true)
    try {
      const goalId = await createPurchaseGoal({
        name: name.trim(),
        vehicleType,
        ...(vehicleType === 'OTHER' ? { customType: customType.trim() } : {}),
        vehiclesRequired: requiredCount,
        ...(condition !== '' ? { condition } : {}),
        ...(make.trim() !== '' ? { make: make.trim() } : {}),
        ...(model.trim() !== '' ? { model: model.trim() } : {}),
        ...(modelYear.trim() !== '' ? { modelYear: Number(modelYear) } : {}),
        ...(color.trim() !== '' ? { color: color.trim() } : {}),
        ...(fuelType !== '' ? { fuelType } : {}),
        ...(transmission !== '' ? { transmission } : {}),
        ...(marketCountry.trim() !== '' ? { marketCountry: marketCountry.trim() } : {}),
        ...(seller.trim() !== '' ? { seller: seller.trim() } : {}),
        ...(targetPurchaseDate !== '' ? { targetPurchaseDate } : {}),
        ...(expectedArrivalDate !== '' ? { expectedArrivalDate } : {}),
        priority,
        ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
        createdBy: currentUserId,
      })

      if (budgetMinor !== null) {
        await setSavingsTarget({
          goalId,
          totalBudgetMinor: budgetMinor,
          ...(targetDate !== '' ? { targetDate } : {}),
        })
      }

      onCreated(goalId)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-4 text-xl font-semibold text-slate-900">New purchase goal</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fourth Sprinter"
            className="rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Vehicle type</span>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VEHICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Vehicles required</span>
            <input
              type="number"
              min={1}
              step={1}
              value={vehiclesRequired}
              onChange={(e) => setVehiclesRequired(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
          </label>
        </div>

        {vehicleType === 'OTHER' && (
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
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">New or used (optional)</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as VehicleCondition | '')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
            >
              <option value="">Not decided</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {VEHICLE_CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as PurchasePriority)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PURCHASE_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Make (optional)</span>
            <input type="text" value={make} onChange={(e) => setMake(e.target.value)} className="rounded-lg border border-slate-300 px-4 py-3 text-base" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Model (optional)</span>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-slate-300 px-4 py-3 text-base" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Year (optional)</span>
            <input
              type="number"
              min={1950}
              max={2100}
              value={modelYear}
              onChange={(e) => setModelYear(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Color (optional)</span>
            <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="rounded-lg border border-slate-300 px-4 py-3 text-base" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Fuel (optional)</span>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as FuelType | '')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
            >
              <option value="">Not decided</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FUEL_TYPE_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Transmission (optional)</span>
            <select
              value={transmission}
              onChange={(e) => setTransmission(e.target.value as TransmissionType | '')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
            >
              <option value="">Not decided</option>
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>
                  {TRANSMISSION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Market country (optional)</span>
            <input
              type="text"
              value={marketCountry}
              onChange={(e) => setMarketCountry(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Seller (optional)</span>
            <input type="text" value={seller} onChange={(e) => setSeller(e.target.value)} className="rounded-lg border border-slate-300 px-4 py-3 text-base" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Target purchase date (optional)</span>
            <input
              type="date"
              value={targetPurchaseDate}
              onChange={(e) => setTargetPurchaseDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Expected arrival (optional)</span>
            <input
              type="date"
              value={expectedArrivalDate}
              onChange={(e) => setExpectedArrivalDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-lg border border-slate-300 px-4 py-3 text-base" />
        </label>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Savings target (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Total budget</span>
              <input
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0.00"
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
              />
              {budgetMinor !== null && budget.trim() !== '' && <span className="text-xs text-slate-500">{formatMinorUnits(budgetMinor)}</span>}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Target date</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Weekly/monthly targets and minimum reserves can be set on the goal once it's created.</p>
        </div>

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
          {submitting ? 'Creating…' : 'Create goal'}
        </button>
      </form>
    </div>
  )
}
