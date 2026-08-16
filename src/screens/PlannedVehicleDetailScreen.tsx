import { useEffect, useState } from 'react'
import {
  ACQUISITION_COST_CATEGORY_LABELS,
  ACQUISITION_PAYMENT_TYPE_LABELS,
  PURCHASE_STAGE_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type {
  AcquisitionCostCategory,
  AcquisitionCostLine,
  AcquisitionPayment,
  AcquisitionPaymentType,
  PlannedVehicleDetail,
  PurchaseStage,
  TransitRecord,
} from '@/data/futurePurchases'
import {
  PURCHASE_STAGE_ORDER,
  changePlannedVehicleStage,
  fetchAcquisitionCostLines,
  fetchAcquisitionPayments,
  fetchPlannedVehicle,
  fetchTransitRecord,
  recordAcquisitionPayment,
  setAcquisitionCostLine,
  setTransitRecord,
} from '@/data/futurePurchases'
import { DocumentPanel } from '@/screens/DocumentPanel'

interface PlannedVehicleDetailScreenProps {
  plannedVehicleId: string
  currentUserId: string
  onBack: () => void
  onOnboard: (plannedVehicleId: string, goalName: string) => void
}

const COST_CATEGORIES = Object.keys(ACQUISITION_COST_CATEGORY_LABELS) as AcquisitionCostCategory[]
const PAYMENT_TYPES = Object.keys(ACQUISITION_PAYMENT_TYPE_LABELS) as AcquisitionPaymentType[]
const TRANSIT_FROM_STAGE = PURCHASE_STAGE_ORDER.indexOf('AWAITING_SHIPMENT')

export function PlannedVehicleDetailScreen({ plannedVehicleId, currentUserId, onBack, onOnboard }: PlannedVehicleDetailScreenProps) {
  const [vehicle, setVehicle] = useState<PlannedVehicleDetail | null>(null)
  const [costLines, setCostLines] = useState<AcquisitionCostLine[]>([])
  const [payments, setPayments] = useState<AcquisitionPayment[]>([])
  const [transit, setTransit] = useState<TransitRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchPlannedVehicle(plannedVehicleId),
      fetchAcquisitionCostLines(plannedVehicleId),
      fetchAcquisitionPayments(plannedVehicleId),
      fetchTransitRecord(plannedVehicleId),
    ])
      .then(([v, lines, pays, tr]) => {
        if (cancelled) return
        setVehicle(v)
        setCostLines(lines)
        setPayments(pays)
        setTransit(tr)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this vehicle. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [plannedVehicleId, reloadKey])

  if (error && !vehicle) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      </div>
    )
  }

  if (!vehicle) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  const estimatedTotal = costLines.reduce((sum, l) => sum + (l.estimatedMinor ?? 0), 0)
  const actualTotal = costLines.reduce((sum, l) => sum + (l.actualMinor ?? 0), 0)
  const stageIndex = PURCHASE_STAGE_ORDER.indexOf(vehicle.stage)
  const showTransit = stageIndex >= TRANSIT_FROM_STAGE || vehicle.stage === 'CANCELLED'

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {vehicle.goalName} — Candidate #{vehicle.sequence}
        </h1>
        <p className="text-sm text-slate-500">{VEHICLE_TYPE_LABELS[vehicle.goalVehicleType]}</p>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <Section title="Stage">
        <StageControl
          plannedVehicleId={plannedVehicleId}
          stage={vehicle.stage}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
        {vehicle.stage === 'READY_FOR_ONBOARDING' && (
          <button
            type="button"
            onClick={() => onOnboard(plannedVehicleId, vehicle.goalName)}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white active:bg-emerald-700"
          >
            Onboard vehicle
          </button>
        )}
        {vehicle.onboardedVehicleId && (
          <p className="mt-2 text-sm text-emerald-700">Onboarded into the active fleet.</p>
        )}
      </Section>

      <Section title="Landed cost">
        <div className="mb-3 flex gap-6 text-sm">
          <span className="text-slate-500">
            Estimated: <span className="font-medium text-slate-900">{formatMinorUnits(estimatedTotal)}</span>
          </span>
          <span className="text-slate-500">
            Actual: <span className="font-medium text-slate-900">{formatMinorUnits(actualTotal)}</span>
          </span>
          {estimatedTotal > 0 && (
            <span className={actualTotal > estimatedTotal ? 'text-red-600' : 'text-emerald-700'}>
              {actualTotal > estimatedTotal ? 'Over' : 'Under'} by {formatMinorUnits(Math.abs(actualTotal - estimatedTotal))}
            </span>
          )}
        </div>
        <CostLinesTable plannedVehicleId={plannedVehicleId} lines={costLines} onChanged={() => setReloadKey((k) => k + 1)} />
      </Section>

      <Section title="Payments">
        <ul className="mb-3 flex flex-col gap-1">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-b-0">
              <span className="text-slate-700">
                {ACQUISITION_PAYMENT_TYPE_LABELS[p.paymentType]} · {p.paidOn}
                {p.nextDueOn && <span className="ml-1 text-slate-400">(next due {p.nextDueOn})</span>}
              </span>
              <span className="text-slate-900">{formatMinorUnits(p.amountMinor)}</span>
            </li>
          ))}
          {payments.length === 0 && <p className="text-sm text-slate-500">No payments recorded yet.</p>}
        </ul>
        <AddPaymentForm plannedVehicleId={plannedVehicleId} onAdded={() => setReloadKey((k) => k + 1)} />
      </Section>

      {showTransit && (
        <Section title="Transit">
          <TransitForm plannedVehicleId={plannedVehicleId} transit={transit} onSaved={() => setReloadKey((k) => k + 1)} />
        </Section>
      )}

      <Section title="Documents">
        <DocumentPanel ownerType="PLANNED_VEHICLE" ownerId={plannedVehicleId} currentUserId={currentUserId} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  )
}

function StageControl({ plannedVehicleId, stage, onChanged }: { plannedVehicleId: string; stage: PurchaseStage; onChanged: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const index = PURCHASE_STAGE_ORDER.indexOf(stage)
  // ACTIVE_IN_SERVICE is only reachable through onboarding (the database
  // enforces this — pv_active_in_service_is_onboarded) — never offered here.
  const next = index >= 0 && index < PURCHASE_STAGE_ORDER.length - 1 ? PURCHASE_STAGE_ORDER[index + 1] : null
  const nextIsOnboarding = next === 'ACTIVE_IN_SERVICE'

  async function move(to: PurchaseStage) {
    setSubmitting(true)
    setError(null)
    try {
      await changePlannedVehicleStage(plannedVehicleId, to)
      setShowAll(false)
      onChanged()
    } catch {
      setError('Could not change stage. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const otherStages = PURCHASE_STAGE_ORDER.filter((s) => s !== stage && s !== 'ACTIVE_IN_SERVICE').concat('CANCELLED')

  return (
    <div>
      <p className="mb-2 text-sm">
        <span className="text-slate-500">Current: </span>
        <span className="font-medium text-slate-900">{PURCHASE_STAGE_LABELS[stage]}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {next && !nextIsOnboarding && (
          <button
            type="button"
            onClick={() => move(next)}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : `Advance to ${PURCHASE_STAGE_LABELS[next]}`}
          </button>
        )}
        {stage !== 'CANCELLED' && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Move to a different stage
          </button>
        )}
      </div>

      {showAll && (
        <div className="mt-3 flex flex-wrap gap-2">
          {otherStages.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => move(s)}
              disabled={submitting}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 active:bg-slate-50"
            >
              {PURCHASE_STAGE_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

function CostLinesTable({ plannedVehicleId, lines, onChanged }: { plannedVehicleId: string; lines: AcquisitionCostLine[]; onChanged: () => void }) {
  const byCategory = Object.fromEntries(lines.map((l) => [l.costCategory, l]))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-1.5 pr-2">Category</th>
            <th className="py-1.5 pr-2">Estimated</th>
            <th className="py-1.5 pr-2">Actual</th>
          </tr>
        </thead>
        <tbody>
          {COST_CATEGORIES.map((category) => (
            <CostLineRow
              key={category}
              plannedVehicleId={plannedVehicleId}
              category={category}
              line={byCategory[category] ?? null}
              onChanged={onChanged}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CostLineRow({
  plannedVehicleId,
  category,
  line,
  onChanged,
}: {
  plannedVehicleId: string
  category: AcquisitionCostCategory
  line: AcquisitionCostLine | null
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [estimated, setEstimated] = useState(line?.estimatedMinor !== null && line?.estimatedMinor !== undefined ? String(line.estimatedMinor / 100) : '')
  const [actual, setActual] = useState(line?.actualMinor !== null && line?.actualMinor !== undefined ? String(line.actualMinor / 100) : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    const estimatedMinor = estimated.trim() === '' ? null : parseMinorUnits(estimated)
    const actualMinor = actual.trim() === '' ? null : parseMinorUnits(actual)
    setSaving(true)
    try {
      await setAcquisitionCostLine(plannedVehicleId, category, estimatedMinor, actualMinor)
      setEditing(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <tr className="border-b border-slate-100">
        <td className="py-1.5 pr-2 text-slate-700">{ACQUISITION_COST_CATEGORY_LABELS[category]}</td>
        <td className="py-1.5 pr-2 text-slate-500">{line?.estimatedMinor != null ? formatMinorUnits(line.estimatedMinor) : '—'}</td>
        <td className="py-1.5 pr-2 text-slate-900">
          {line?.actualMinor != null ? formatMinorUnits(line.actualMinor) : '—'}{' '}
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-400 underline decoration-slate-300">
            Edit
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-slate-100">
      <td className="py-1.5 pr-2 text-slate-700">{ACQUISITION_COST_CATEGORY_LABELS[category]}</td>
      <td className="py-1.5 pr-2">
        <input type="text" inputMode="decimal" value={estimated} onChange={(e) => setEstimated(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
      </td>
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-1">
          <input type="text" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
          <button type="button" onClick={save} disabled={saving} className="text-xs text-slate-900 underline decoration-slate-300 disabled:opacity-50">
            {saving ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-400">
            ✕
          </button>
        </div>
      </td>
    </tr>
  )
}

function AddPaymentForm({ plannedVehicleId, onAdded }: { plannedVehicleId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [paymentType, setPaymentType] = useState<AcquisitionPaymentType>('DEPOSIT')
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [nextDueOn, setNextDueOn] = useState('')
  const [method, setMethod] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50">
        + Record a payment
      </button>
    )
  }

  async function submit() {
    const minor = parseMinorUnits(amount)
    if (minor === null || minor <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (paidOn === '') {
      setError('Enter the date paid.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await recordAcquisitionPayment({
        plannedVehicleId,
        paymentType,
        amountMinor: minor,
        paidOn,
        ...(method.trim() !== '' ? { method: method.trim() } : {}),
        ...(paidTo.trim() !== '' ? { paidTo: paidTo.trim() } : {}),
        ...(nextDueOn !== '' ? { nextDueOn } : {}),
      })
      setOpen(false)
      setAmount('')
      setPaidOn('')
      setNextDueOn('')
      setMethod('')
      setPaidTo('')
      onAdded()
    } catch {
      setError('Could not record this payment. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as AcquisitionPaymentType)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {PAYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACQUISITION_PAYMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={nextDueOn} onChange={(e) => setNextDueOn(e.target.value)} placeholder="Next due (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Method (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Recipient (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Recording…' : 'Record payment'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  )
}

function TransitForm({ plannedVehicleId, transit, onSaved }: { plannedVehicleId: string; transit: TransitRecord | null; onSaved: () => void }) {
  const [vin, setVin] = useState(transit?.vin ?? '')
  const [engineNumber, setEngineNumber] = useState(transit?.engineNumber ?? '')
  const [shippingCompany, setShippingCompany] = useState(transit?.shippingCompany ?? '')
  const [billOfLading, setBillOfLading] = useState(transit?.billOfLading ?? '')
  const [shippedOn, setShippedOn] = useState(transit?.shippedOn ?? '')
  const [expectedArrival, setExpectedArrival] = useState(transit?.expectedArrival ?? '')
  const [actualArrival, setActualArrival] = useState(transit?.actualArrival ?? '')
  const [currentLocation, setCurrentLocation] = useState(transit?.currentLocation ?? '')
  const [clearingAgent, setClearingAgent] = useState(transit?.clearingAgent ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSubmitting(true)
    setError(null)
    try {
      await setTransitRecord(plannedVehicleId, {
        ...(vin.trim() !== '' ? { vin: vin.trim() } : {}),
        ...(engineNumber.trim() !== '' ? { engineNumber: engineNumber.trim() } : {}),
        ...(shippingCompany.trim() !== '' ? { shippingCompany: shippingCompany.trim() } : {}),
        ...(billOfLading.trim() !== '' ? { billOfLading: billOfLading.trim() } : {}),
        ...(shippedOn !== '' ? { shippedOn } : {}),
        ...(expectedArrival !== '' ? { expectedArrival } : {}),
        ...(actualArrival !== '' ? { actualArrival } : {}),
        ...(currentLocation.trim() !== '' ? { currentLocation: currentLocation.trim() } : {}),
        ...(clearingAgent.trim() !== '' ? { clearingAgent: clearingAgent.trim() } : {}),
      })
      onSaved()
    } catch {
      setError('Could not save transit details. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" value={engineNumber} onChange={(e) => setEngineNumber(e.target.value)} placeholder="Engine number" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" value={shippingCompany} onChange={(e) => setShippingCompany(e.target.value)} placeholder="Shipping company" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" value={billOfLading} onChange={(e) => setBillOfLading(e.target.value)} placeholder="Bill of lading" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Shipped on
          <input type="date" value={shippedOn} onChange={(e) => setShippedOn(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Expected arrival
          <input type="date" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Actual arrival
          <input type="date" value={actualArrival} onChange={(e) => setActualArrival(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </label>
        <input type="text" value={currentLocation} onChange={(e) => setCurrentLocation(e.target.value)} placeholder="Current location" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" value={clearingAgent} onChange={(e) => setClearingAgent(e.target.value)} placeholder="Clearing agent" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="button" onClick={save} disabled={submitting} className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {submitting ? 'Saving…' : 'Save transit details'}
      </button>
    </div>
  )
}
