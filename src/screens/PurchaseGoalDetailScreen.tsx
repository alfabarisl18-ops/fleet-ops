import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import {
  FUEL_TYPE_LABELS,
  PURCHASE_GOAL_STATUS_LABELS,
  PURCHASE_PRIORITY_LABELS,
  PURCHASE_STAGE_LABELS,
  TRANSMISSION_TYPE_LABELS,
  VEHICLE_CONDITION_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { AppRole } from '@/data/auth'
import type {
  AcquisitionCostLine,
  CashReservation,
  Forecast,
  PlannedVehicleListItem,
  PurchaseGoalDetail,
  PurchaseGoalStatus,
  SavingsTarget,
} from '@/data/futurePurchases'
import {
  addPlannedVehicle,
  fetchAcquisitionCostLines,
  fetchCashReservations,
  fetchForecast,
  fetchPlannedVehicles,
  fetchPurchaseGoal,
  fetchSavingsTarget,
  releaseCash,
  reserveCash,
  setSavingsTarget,
  updatePurchaseGoalStatus,
} from '@/data/futurePurchases'
import { DocumentPanel } from '@/screens/DocumentPanel'

interface PurchaseGoalDetailScreenProps {
  goalId: string
  currentUserId: string
  currentUserRole: AppRole
  onBack: () => void
  onOpenPlannedVehicle: (plannedVehicleId: string) => void
}

const GOAL_STATUSES: PurchaseGoalStatus[] = ['ACTIVE', 'ON_HOLD', 'ACHIEVED', 'CANCELLED']

export function PurchaseGoalDetailScreen({ goalId, currentUserId, currentUserRole, onBack, onOpenPlannedVehicle }: PurchaseGoalDetailScreenProps) {
  const [goal, setGoal] = useState<PurchaseGoalDetail | null>(null)
  const [target, setTarget] = useState<SavingsTarget | null>(null)
  const [reservations, setReservations] = useState<CashReservation[] | null>(null)
  const [plannedVehicles, setPlannedVehicles] = useState<PlannedVehicleListItem[] | null>(null)
  const [costsByVehicle, setCostsByVehicle] = useState<Record<string, AcquisitionCostLine[]>>({})
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [addingCandidate, setAddingCandidate] = useState(false)

  const isOwner = currentUserRole === 'OWNER_ADMIN'

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchPurchaseGoal(goalId), fetchSavingsTarget(goalId), fetchCashReservations(goalId), fetchPlannedVehicles(goalId), fetchForecast(goalId)])
      .then(async ([g, t, r, pv, f]) => {
        if (cancelled) return
        setGoal(g)
        setTarget(t)
        setReservations(r)
        setPlannedVehicles(pv)
        setForecast(f)
        const costEntries = await Promise.all(pv.map(async (p) => [p.id, await fetchAcquisitionCostLines(p.id)] as const))
        if (!cancelled) setCostsByVehicle(Object.fromEntries(costEntries))
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this purchase goal. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [goalId, reloadKey])

  async function handleAddCandidate() {
    setAddingCandidate(true)
    try {
      const id = await addPlannedVehicle(goalId)
      onOpenPlannedVehicle(id)
    } catch {
      setError('Could not add a candidate vehicle. Try again.')
    } finally {
      setAddingCandidate(false)
    }
  }

  if (error && !goal) {
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

  if (!goal) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  const savedMinor = (reservations ?? []).filter((r) => r.releasedAt === null).reduce((sum, r) => sum + r.amountMinor, 0)
  const stillRequiredMinor = target ? Math.max(target.totalBudgetMinor - savedMinor, 0) : null
  const percent = target && target.totalBudgetMinor > 0 ? Math.min(Math.trunc((savedMinor / target.totalBudgetMinor) * 100), 100) : null

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm font-medium text-slate-500">
        ← Back
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconChip section="future-purchases" />
          <div>
            <h1 className="font-heading text-xl font-bold text-slate-900">{goal.name}</h1>
            <p className="text-sm text-slate-500">
              {VEHICLE_TYPE_LABELS[goal.vehicleType]}
              {goal.vehicleType === 'OTHER' && goal.customType ? ` — ${goal.customType}` : ''} · {goal.vehiclesRequired} required
            </p>
          </div>
        </div>
        <StatusPicker
          status={goal.status}
          onChange={async (s) => {
            await updatePurchaseGoalStatus(goalId, s)
            setReloadKey((k) => k + 1)
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <Card title="Details" className="mb-4">
        <Field label="Priority" value={PURCHASE_PRIORITY_LABELS[goal.priority]} />
        <Field label="Condition" value={goal.condition ? VEHICLE_CONDITION_LABELS[goal.condition] : null} />
        <Field label="Make / model" value={[goal.make, goal.model].filter(Boolean).join(' ') || null} />
        <Field label="Year" value={goal.modelYear ? String(goal.modelYear) : null} />
        <Field label="Color" value={goal.color} />
        <Field label="Fuel" value={goal.fuelType ? FUEL_TYPE_LABELS[goal.fuelType] : null} />
        <Field label="Transmission" value={goal.transmission ? TRANSMISSION_TYPE_LABELS[goal.transmission] : null} />
        <Field label="Market country" value={goal.marketCountry} />
        <Field label="Seller" value={goal.seller} />
        <Field label="Target purchase date" value={goal.targetPurchaseDate} />
        <Field label="Expected arrival" value={goal.expectedArrivalDate} />
        {goal.notes && (
          <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">{goal.notes}</p>
        )}
      </Card>

      <Card title="Funding" className="mb-4">
        {target ? (
          <>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full ${progressColor(percent)}`}
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
            <p className="mb-3 text-sm text-slate-600">
              {formatMinorUnits(savedMinor)} saved of {formatMinorUnits(target.totalBudgetMinor)} ({percent}%)
              {stillRequiredMinor !== null && stillRequiredMinor > 0 && ` — ${formatMinorUnits(stillRequiredMinor)} still required`}
            </p>
            <Field label="Target date" value={target.targetDate} />
            <Field label="Weekly target" value={target.weeklyTargetMinor !== null ? formatMinorUnits(target.weeklyTargetMinor) : null} />
            <Field label="Monthly target" value={target.monthlyTargetMinor !== null ? formatMinorUnits(target.monthlyTargetMinor) : null} />
            <Field label="Minimum operating cash kept aside" value={formatMinorUnits(target.minOperatingCashMinor)} />
            <Field label="Minimum emergency reserve kept aside" value={formatMinorUnits(target.minEmergencyReserveMinor)} />
            <p className="mt-2 text-xs text-slate-500">
              This is what's reserved for this goal — never a signal that the total business balance alone makes a vehicle affordable.
            </p>
          </>
        ) : (
          <SavingsTargetForm goalId={goalId} onSaved={() => setReloadKey((k) => k + 1)} />
        )}
        {target && <SavingsTargetEditToggle goalId={goalId} target={target} onSaved={() => setReloadKey((k) => k + 1)} />}
      </Card>

      <Card title="Cash reserved" className="mb-4">
        {isOwner ? (
          <ReservationPanel goalId={goalId} currentUserId={currentUserId} onChanged={() => setReloadKey((k) => k + 1)} />
        ) : (
          <p className="text-sm text-slate-500">Only Owner/Admin can reserve or release business cash toward a goal.</p>
        )}
        <ul className="mt-3 flex flex-col gap-1">
          {reservations?.map((r) => (
            <li key={r.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-b-0">
              <span className="text-slate-700">
                {r.reservedAt.slice(0, 10)} {r.note ? `— ${r.note}` : ''}
                {r.releasedAt && <span className="ml-1 text-slate-400">(released)</span>}
              </span>
              <span className={r.releasedAt ? 'text-slate-400 line-through' : 'text-slate-900'}>{formatMinorUnits(r.amountMinor)}</span>
            </li>
          ))}
          {reservations?.length === 0 && <p className="text-sm text-slate-500">No cash reserved yet.</p>}
        </ul>
      </Card>

      {forecast && (
        <Card title="Forecast" className="mb-4">
          <p className="text-sm text-slate-700">
            Average monthly profit over the last 3 months: {formatMinorUnits(forecast.avgMonthlyProfitMinor)}
            {forecast.outstandingBalancesMinor > 0 && ` (plus ${formatMinorUnits(forecast.outstandingBalancesMinor)} still owed to the business)`}.
          </p>
          {forecast.projectedFundedDate ? (
            <p className="mt-1 text-sm text-slate-700">
              At the present savings rate, this goal is expected to be fully funded by <strong>{forecast.projectedFundedDate}</strong>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Set a savings target and a monthly amount to see a projected funded date.</p>
          )}
        </Card>
      )}

      <Card title="Candidate vehicles" className="mb-4">
        <p className="mb-3 text-sm text-slate-500">
          Compare candidates side by side — nothing here is auto-selected. Advance one to Deposit paid or later once you've decided.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plannedVehicles?.map((pv) => {
            const lines = costsByVehicle[pv.id] ?? []
            const estimatedTotal = lines.reduce((sum, l) => sum + (l.estimatedMinor ?? 0), 0)
            const actualTotal = lines.reduce((sum, l) => sum + (l.actualMinor ?? 0), 0)
            return (
              <Card key={pv.id} onClick={() => onOpenPlannedVehicle(pv.id)}>
                <span className="block font-medium text-slate-900">Candidate #{pv.sequence}</span>
                <span className="block text-sm text-slate-500">{PURCHASE_STAGE_LABELS[pv.stage]}</span>
                <span className="mt-2 block text-sm text-slate-700">
                  Est. landed cost: {estimatedTotal > 0 ? formatMinorUnits(estimatedTotal) : '—'}
                </span>
                {actualTotal > 0 && <span className="block text-sm text-slate-700">Actual so far: {formatMinorUnits(actualTotal)}</span>}
              </Card>
            )
          })}
        </div>
        {plannedVehicles?.length === 0 && <p className="text-sm text-slate-500">No candidates yet.</p>}
        <button
          type="button"
          onClick={handleAddCandidate}
          disabled={addingCandidate}
          className="mt-3 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50 disabled:opacity-50"
        >
          {addingCandidate ? 'Adding…' : '+ Add a candidate vehicle'}
        </button>
      </Card>

      <Card title="Supporting documents">
        <DocumentPanel ownerType="PURCHASE_GOAL" ownerId={goalId} currentUserId={currentUserId} />
      </Card>
    </div>
  )
}

function progressColor(percent: number | null): string {
  if (percent === null) return 'bg-slate-300'
  if (percent >= 90) return 'bg-emerald-500'
  if (percent >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <p className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </p>
  )
}

function StatusPicker({ status, onChange }: { status: PurchaseGoalStatus; onChange: (s: PurchaseGoalStatus) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  return (
    <select
      value={status}
      disabled={saving}
      onChange={async (e) => {
        setSaving(true)
        try {
          await onChange(e.target.value as PurchaseGoalStatus)
        } finally {
          setSaving(false)
        }
      }}
      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
    >
      {GOAL_STATUSES.map((s) => (
        <option key={s} value={s}>
          {PURCHASE_GOAL_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  )
}

function SavingsTargetForm({ goalId, onSaved }: { goalId: string; onSaved: () => void }) {
  const [budget, setBudget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const budgetMinor = budget.trim() === '' ? null : parseMinorUnits(budget)

  async function save() {
    if (budgetMinor === null) {
      setError('Enter a valid budget amount.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await setSavingsTarget({ goalId, totalBudgetMinor: budgetMinor, ...(targetDate !== '' ? { targetDate } : {}) })
      onSaved()
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-500">No savings target set yet.</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Total budget"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={submitting}
        className="self-start rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Set savings target'}
      </button>
    </div>
  )
}

function SavingsTargetEditToggle({ goalId, target, onSaved }: { goalId: string; target: SavingsTarget; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState(String(target.totalBudgetMinor / 100))
  const [targetDate, setTargetDate] = useState(target.targetDate ?? '')
  const [weekly, setWeekly] = useState(target.weeklyTargetMinor !== null ? String(target.weeklyTargetMinor / 100) : '')
  const [monthly, setMonthly] = useState(target.monthlyTargetMinor !== null ? String(target.monthlyTargetMinor / 100) : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-primary-600 underline decoration-primary-200">
        Edit savings target
      </button>
    )
  }

  async function save() {
    const budgetMinor = parseMinorUnits(budget)
    if (budgetMinor === null) {
      setError('Enter a valid budget amount.')
      return
    }
    const weeklyMinor = weekly.trim() === '' ? null : parseMinorUnits(weekly)
    const monthlyMinor = monthly.trim() === '' ? null : parseMinorUnits(monthly)
    setSubmitting(true)
    setError(null)
    try {
      await setSavingsTarget({
        goalId,
        totalBudgetMinor: budgetMinor,
        ...(targetDate !== '' ? { targetDate } : {}),
        ...(weeklyMinor !== null ? { weeklyTargetMinor: weeklyMinor } : {}),
        ...(monthlyMinor !== null ? { monthlyTargetMinor: monthlyMinor } : {}),
      })
      setOpen(false)
      onSaved()
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input type="text" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Total budget" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="Weekly target" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="Monthly target" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={submitting} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Owner/Admin only — real enforcement is cash_reservations_insert's own
 *  RLS (app.is_owner()); this is convenience gating so a Fleet Manager
 *  never sees a control that would just fail. */
function ReservationPanel({ goalId, currentUserId, onChanged }: { goalId: string; currentUserId: string; onChanged: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reserve() {
    const minor = parseMinorUnits(amount)
    if (minor === null || minor <= 0) {
      setError('Enter a valid amount.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await reserveCash(goalId, minor, currentUserId, note.trim() === '' ? undefined : note.trim())
      setAmount('')
      setNote('')
      onChanged()
    } catch {
      setError('Could not reserve cash. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount to reserve"
          className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <button type="button" onClick={reserve} disabled={submitting} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Reserving…' : 'Reserve cash'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <ReleasablePanel goalId={goalId} currentUserId={currentUserId} onChanged={onChanged} />
    </div>
  )
}

function ReleasablePanel({ goalId, currentUserId, onChanged }: { goalId: string; currentUserId: string; onChanged: () => void }) {
  const [reservations, setReservations] = useState<CashReservation[]>([])

  useEffect(() => {
    let cancelled = false
    fetchCashReservations(goalId).then((r) => {
      if (!cancelled) setReservations(r.filter((x) => x.releasedAt === null))
    })
    return () => {
      cancelled = true
    }
  }, [goalId])

  if (reservations.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {reservations.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={async () => {
            await releaseCash(r.id, currentUserId)
            onChanged()
          }}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-600 active:bg-slate-50"
        >
          Release {formatMinorUnits(r.amountMinor)}
        </button>
      ))}
    </div>
  )
}
