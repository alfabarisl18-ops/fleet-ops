import { useEffect, useState } from 'react'
import { CorrectionPanel } from '@/components/CorrectionPanel'
import { OWNERSHIP_TRANSFER_STATUS_LABELS, PAYMENT_FREQUENCY_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { AppRole } from '@/data/auth'
import type { Correction } from '@/data/corrections'
import { fetchPendingCorrection, requestCorrection } from '@/data/corrections'
import type { DriverListItem } from '@/data/drivers'
import { assignDriverToVehicle, fetchDrivers } from '@/data/drivers'
import type { AgreementProgress, DriverPurchaseAgreement } from '@/data/driverPurchaseAgreements'
import { cancelAgreement, completeAgreement, fetchAgreementProgress, fetchOpenAgreementForVehicle } from '@/data/driverPurchaseAgreements'
import { updateVehicleTarget } from '@/data/accounting'
import type { RouteOption, VehicleDetail, VehicleStatus } from '@/data/vehicles'
import { changeVehicleStatus, fetchRoutes, fetchVehicle, updateExpectedDailyAmount } from '@/data/vehicles'

function isDesktopRole(role: AppRole): boolean {
  return role === 'OWNER_ADMIN' || role === 'FLEET_MANAGER'
}

interface VehicleProfileScreenProps {
  vehicleId: string
  currentUserId: string
  currentUserRole: AppRole
  onBack: () => void
  onOpenDriver: (driverId: string) => void
  onAddDriverToAssign: (vehicleId: string) => void
  onSetUpAgreement: (vehicleId: string) => void
}

const STATUS_ORDER: VehicleStatus[] = ['ACTIVE', 'GROUNDED', 'IN_MAINTENANCE']

export function VehicleProfileScreen({
  vehicleId,
  currentUserId,
  currentUserRole,
  onBack,
  onOpenDriver,
  onAddDriverToAssign,
  onSetUpAgreement,
}: VehicleProfileScreenProps) {
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null)
  const [agreement, setAgreement] = useState<(DriverPurchaseAgreement & { driverName: string }) | null>(null)
  const [progress, setProgress] = useState<AgreementProgress | null>(null)
  const [pendingCorrection, setPendingCorrection] = useState<Correction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchVehicle(vehicleId), fetchOpenAgreementForVehicle(vehicleId), fetchPendingCorrection('VEHICLE', vehicleId)])
      .then(([v, a, c]) => {
        if (cancelled) return
        setVehicle(v)
        setAgreement(a)
        setPendingCorrection(c)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this vehicle. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [vehicleId, reloadKey])

  // Amount paid/remaining is derived from ledger entries, not stored on the
  // agreement — fetched separately, keyed on the agreement so it refetches
  // after a reload (e.g. right after a new agreement is set up, when it's
  // still zero paid). Only rendered when `agreement` is truthy (below), so
  // there's no need to reset it back to null when the agreement goes away.
  useEffect(() => {
    if (!vehicle || !agreement) return
    let cancelled = false
    fetchAgreementProgress(vehicle.id, agreement.agreementAmountMinor, agreement.startedOn)
      .then((p) => {
        if (!cancelled) setProgress(p)
      })
      .catch(() => {
        // Non-critical — the rest of the profile still shows without it.
      })
    return () => {
      cancelled = true
    }
  }, [vehicle, agreement])

  // A failed background reload (e.g. after a status change) shouldn't wipe
  // an already-loaded profile off the screen — only block on error before
  // anything has loaded yet.
  if (error && !vehicle) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
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
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="text-xl font-semibold text-slate-900">{vehicle.fleetId}</h1>
      <p className="mb-4 text-sm text-slate-500">
        {VEHICLE_TYPE_LABELS[vehicle.type]}
        {vehicle.type === 'OTHER' && vehicle.customType ? ` — ${vehicle.customType}` : ''}
        {vehicle.plate ? ` · ${vehicle.plate}` : ''}
      </p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <Section title="Identity">
        <Field label="Fleet ID" value={vehicle.fleetId} />
        <Field label="Plate" value={vehicle.plate} />
        <Field label="Color" value={vehicle.color} />
        <Field label="Distinguishing marks" value={vehicle.distinguishingMarks} />
        {vehicle.type === 'OTHER' && <Field label="Description" value={vehicle.customDescription} />}
        <Field label="Route" value={vehicle.routeName} />
        <CorrectionPanel
          currentUserRole={currentUserRole}
          pending={pendingCorrection}
          onChanged={() => setReloadKey((k) => k + 1)}
          renderRequestForm={(onDone) => (
            <RequestVehicleCorrectionForm vehicle={vehicle} currentUserId={currentUserId} onRequested={onDone} />
          )}
        />
      </Section>

      <Section title="Status">
        <StatusControl vehicle={vehicle} currentUserId={currentUserId} onChanged={() => setReloadKey((k) => k + 1)} />
      </Section>

      <Section title="Current driver">
        {vehicle.currentDriverId ? (
          <button type="button" onClick={() => onOpenDriver(vehicle.currentDriverId as string)} className="text-left">
            <span className="block font-medium text-slate-900 underline decoration-slate-300">
              {vehicle.currentDriverName ?? '(unnamed)'}
            </span>
            {vehicle.currentDriverPhone && <span className="block text-sm text-slate-500">{vehicle.currentDriverPhone}</span>}
          </button>
        ) : (
          <p className="text-sm text-slate-500">No driver currently assigned.</p>
        )}
        <AssignDriverPanel
          vehicleId={vehicle.id}
          vehicleRouteId={vehicle.routeId}
          onAssigned={() => setReloadKey((k) => k + 1)}
          onAddNewDriver={() => onAddDriverToAssign(vehicle.id)}
        />
      </Section>

      <Section title="Purchase">
        <Field label="Purchased on" value={vehicle.purchasedOn} />
        <Field
          label="Purchase price"
          value={vehicle.purchasePriceMinor !== null ? formatMinorUnits(vehicle.purchasePriceMinor) : null}
        />
        <Field label="Entered service on" value={vehicle.enteredServiceOn} />
        <Field label="Expected retirement" value={vehicle.expectedRetirementOn} />
        {isDesktopRole(currentUserRole) ? (
          <TargetPanel vehicleId={vehicle.id} yearlyTargetMinor={vehicle.yearlyTargetMinor} onSaved={() => setReloadKey((k) => k + 1)} />
        ) : (
          <Field label="Yearly target" value={formatMinorUnits(vehicle.yearlyTargetMinor)} />
        )}
        {isDesktopRole(currentUserRole) ? (
          <DailyTargetPanel
            vehicleId={vehicle.id}
            expectedDailyAmountMinor={vehicle.expectedDailyAmountMinor}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
        ) : (
          <Field label="Daily target" value={formatMinorUnits(vehicle.expectedDailyAmountMinor)} />
        )}
      </Section>

      <Section title="Driver-purchase agreement">
        {agreement ? (
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => onOpenDriver(agreement.driverId)} className="text-left">
              <span className="font-medium text-slate-900 underline decoration-slate-300">{agreement.driverName}</span>
            </button>
            <Field label="Agreement amount" value={formatMinorUnits(agreement.agreementAmountMinor)} />
            <Field
              label="Regular payment"
              value={`${formatMinorUnits(agreement.regularPaymentMinor)} (${PAYMENT_FREQUENCY_LABELS[agreement.paymentFrequency]})`}
            />
            <Field label="Started" value={agreement.startedOn} />
            <Field label="Expected completion" value={agreement.expectedCompletionOn} />
            <Field label="Ownership transfer" value={OWNERSHIP_TRANSFER_STATUS_LABELS[agreement.ownershipTransferStatus]} />
            {progress && (
              <>
                <Field label="Paid so far" value={formatMinorUnits(progress.paidMinor)} />
                <Field label="Remaining" value={formatMinorUnits(progress.remainingMinor)} />
              </>
            )}
            {isDesktopRole(currentUserRole) && (
              <AgreementActionsPanel agreementId={agreement.id} onChanged={() => setReloadKey((k) => k + 1)} />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-slate-500">No driver-purchase agreement for this vehicle.</p>
            <button
              type="button"
              onClick={() => onSetUpAgreement(vehicle.id)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
            >
              Set up driver-purchase agreement
            </button>
          </div>
        )}
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value ?? '—'}</span>
    </p>
  )
}

/** Desktop-only via vehicles_update_desktop. Closes the gap
 *  yearly_target_minor had no edit path at all (excluded from the
 *  vehicle correction allow-list, decision 0009) — Accounting's
 *  Sprinter Income and the VEHICLE_BELOW_TARGET alert both depend on it. */
function TargetPanel({ vehicleId, yearlyTargetMinor, onSaved }: { vehicleId: string; yearlyTargetMinor: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(yearlyTargetMinor / 100))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const minor = parseMinorUnits(value)
    if (minor === null || minor < 0) {
      setError('Enter a valid amount.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await updateVehicleTarget(vehicleId, minor)
      setEditing(false)
      onSaved()
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!editing) {
    return (
      <p className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
        <span className="text-slate-500">Yearly target</span>
        <span className="text-right text-slate-900">
          {formatMinorUnits(yearlyTargetMinor)}{' '}
          <button type="button" onClick={() => setEditing(true)} className="text-slate-500 underline decoration-slate-300">
            Edit
          </button>
        </span>
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">Yearly target</span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
      />
      <button type="button" onClick={save} disabled={submitting} className="text-slate-900 underline decoration-slate-300 disabled:opacity-50">
        {submitting ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setError(null)
        }}
        className="text-slate-400"
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

/** Same shape as TargetPanel above. Closes a gap that predates this
 *  feature — expected_daily_amount_minor had no edit path anywhere,
 *  set once at onboarding. Needed now because set_up_driver_purchase_agreement
 *  writes this value as a side effect and cancel_driver_purchase_agreement
 *  deliberately does not restore it — this is how a mistake gets fixed. */
function DailyTargetPanel({
  vehicleId,
  expectedDailyAmountMinor,
  onSaved,
}: {
  vehicleId: string
  expectedDailyAmountMinor: number
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(expectedDailyAmountMinor / 100))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const minor = parseMinorUnits(value)
    if (minor === null || minor < 0) {
      setError('Enter a valid amount.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await updateExpectedDailyAmount(vehicleId, minor)
      setEditing(false)
      onSaved()
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!editing) {
    return (
      <p className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
        <span className="text-slate-500">Daily target</span>
        <span className="text-right text-slate-900">
          {formatMinorUnits(expectedDailyAmountMinor)}{' '}
          <button type="button" onClick={() => setEditing(true)} className="text-slate-500 underline decoration-slate-300">
            Edit
          </button>
        </span>
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">Daily target</span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
      />
      <button type="button" onClick={save} disabled={submitting} className="text-slate-900 underline decoration-slate-300 disabled:opacity-50">
        {submitting ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setError(null)
        }}
        className="text-slate-400"
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

/** Either desktop role, matching dpa_update_desktop's scope. "Mark
 *  complete" confirms first — it archives the vehicle, a one-way action.
 *  "Cancel" requires a reason, matching ForgiveDebtPanel's convention. */
function AgreementActionsPanel({ agreementId, onChanged }: { agreementId: string; onChanged: () => void }) {
  const [mode, setMode] = useState<'idle' | 'confirm-complete' | 'cancel'>('idle')
  const [cancelReason, setCancelReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmComplete() {
    setSubmitting(true)
    setError(null)
    try {
      await completeAgreement(agreementId)
      setMode('idle')
      onChanged()
    } catch {
      setError('Could not complete this agreement. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmCancel() {
    if (cancelReason.trim() === '') {
      setError('A reason is required to cancel an agreement.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await cancelAgreement(agreementId, cancelReason.trim())
      setMode('idle')
      setCancelReason('')
      onChanged()
    } catch {
      setError('Could not cancel this agreement. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'idle') {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('confirm-complete')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
        >
          Mark complete
        </button>
        <button
          type="button"
          onClick={() => setMode('cancel')}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 active:bg-red-50"
        >
          Cancel agreement
        </button>
      </div>
    )
  }

  if (mode === 'confirm-complete') {
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
        <p className="text-sm text-slate-700">
          Marking this agreement complete transfers ownership to the driver and archives this vehicle — it will no longer
          be an active vehicle. This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirmComplete}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Completing…' : 'Yes, mark complete and archive'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('idle')
              setError(null)
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-red-200 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Reason</span>
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={2}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirmCancel}
          disabled={submitting}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Cancelling…' : 'Confirm cancellation'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('idle')
            setError(null)
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Back
        </button>
      </div>
    </div>
  )
}

function StatusControl({
  vehicle,
  currentUserId,
  onChanged,
}: {
  vehicle: VehicleDetail
  currentUserId: string
  onChanged: () => void
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
      setTarget(null)
      setReason('')
      onChanged()
    } catch {
      setError('Could not change status. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm">
        <span className="text-slate-500">Current: </span>
        <span className="font-medium text-slate-900">{VEHICLE_STATUS_LABELS[vehicle.status]}</span>
      </p>

      {!target && (
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.filter((s) => s !== vehicle.status).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTarget(s)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
            >
              Move to {VEHICLE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {target && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <p className="text-sm text-slate-700">
            Change status to <span className="font-medium">{VEHICLE_STATUS_LABELS[target]}</span>
          </p>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTarget(null)
                setError(null)
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignDriverPanel({
  vehicleId,
  vehicleRouteId,
  onAssigned,
  onAddNewDriver,
}: {
  vehicleId: string
  vehicleRouteId: string | null
  onAssigned: () => void
  onAddNewDriver: () => void
}) {
  const [open, setOpen] = useState(false)
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [driverId, setDriverId] = useState('')
  const [routeId, setRouteId] = useState(vehicleRouteId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || drivers !== null) return
    let cancelled = false
    Promise.all([fetchDrivers(), fetchRoutes()])
      .then(([d, r]) => {
        if (cancelled) return
        const activeDrivers = d.filter((driver) => driver.status === 'ACTIVE')
        setDrivers(activeDrivers)
        setRoutes(r)
        if (activeDrivers[0]) setDriverId(activeDrivers[0].id)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load drivers.')
      })
    return () => {
      cancelled = true
    }
  }, [open, drivers])

  async function confirm() {
    if (driverId === '') {
      setError('Choose a driver.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await assignDriverToVehicle(driverId, vehicleId, routeId === '' ? null : routeId)
      setOpen(false)
      onAssigned()
    } catch {
      setError('Could not assign this driver. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
      >
        Assign driver
      </button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      {drivers === null && !error && <p className="text-sm text-slate-500">Loading drivers…</p>}

      {drivers?.length === 0 && (
        <p className="text-sm text-slate-500">No active drivers yet.</p>
      )}

      {drivers && drivers.length > 0 && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Driver</span>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Route (optional)</span>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {drivers && drivers.length > 0 && (
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        )}
        <button type="button" onClick={onAddNewDriver} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
          + Add a new driver
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Pre-filled with current values, per the Phase 4 plan — the person changes
 * whichever field(s) need fixing and states why. Fields match
 * apply_correction's vehicle allow-list exactly (decision 0009); type,
 * status, current_driver_id, expected_daily_amount_minor, and
 * yearly_target_minor are deliberately not here — see that decision.
 */
function RequestVehicleCorrectionForm({
  vehicle,
  currentUserId,
  onRequested,
}: {
  vehicle: VehicleDetail
  currentUserId: string
  onRequested: () => void
}) {
  const [fleetId, setFleetId] = useState(vehicle.fleetId)
  const [plate, setPlate] = useState(vehicle.plate ?? '')
  const [color, setColor] = useState(vehicle.color ?? '')
  const [distinguishingMarks, setDistinguishingMarks] = useState(vehicle.distinguishingMarks ?? '')
  const [customType, setCustomType] = useState(vehicle.customType ?? '')
  const [customDescription, setCustomDescription] = useState(vehicle.customDescription ?? '')
  const [purchasedOn, setPurchasedOn] = useState(vehicle.purchasedOn ?? '')
  const [purchasePrice, setPurchasePrice] = useState(
    vehicle.purchasePriceMinor !== null ? formatMinorUnits(vehicle.purchasePriceMinor).replace('SLE ', '').replace(/,/g, '') : '',
  )
  const [enteredServiceOn, setEnteredServiceOn] = useState(vehicle.enteredServiceOn ?? '')
  const [expectedRetirementOn, setExpectedRetirementOn] = useState(vehicle.expectedRetirementOn ?? '')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priceMinor = purchasePrice.trim() === '' ? null : parseMinorUnits(purchasePrice)
  const priceInvalid = purchasePrice.trim() !== '' && priceMinor === null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (reason.trim().length < 3) {
      setError('Say why this correction is needed (at least a few words).')
      return
    }
    if (priceInvalid) {
      setError('Purchase price is not a valid amount.')
      return
    }

    setSubmitting(true)
    try {
      await requestCorrection({
        targetTable: 'VEHICLE',
        targetId: vehicle.id,
        reason: reason.trim(),
        requestedBy: currentUserId,
        afterJson: {
          fleet_id: fleetId.trim(),
          plate: plate.trim() === '' ? null : plate.trim(),
          color: color.trim() === '' ? null : color.trim(),
          distinguishing_marks: distinguishingMarks.trim() === '' ? null : distinguishingMarks.trim(),
          custom_type: customType.trim() === '' ? null : customType.trim(),
          custom_description: customDescription.trim() === '' ? null : customDescription.trim(),
          purchased_on: purchasedOn === '' ? null : purchasedOn,
          purchase_price_minor: priceMinor,
          entered_service_on: enteredServiceOn === '' ? null : enteredServiceOn,
          expected_retirement_on: expectedRetirementOn === '' ? null : expectedRetirementOn,
        },
      })
      onRequested()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Fleet ID</span>
        <input
          type="text"
          value={fleetId}
          onChange={(e) => setFleetId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Plate</span>
        <input
          type="text"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Color</span>
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Distinguishing marks</span>
        <input
          type="text"
          value={distinguishingMarks}
          onChange={(e) => setDistinguishingMarks(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {vehicle.type === 'OTHER' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Type description</span>
            <input
              type="text"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <input
              type="text"
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Purchase date</span>
        <input
          type="date"
          value={purchasedOn}
          onChange={(e) => setPurchasedOn(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Purchase price</span>
        <input
          type="text"
          inputMode="decimal"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          placeholder="0.00"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Service entry date</span>
        <input
          type="date"
          value={enteredServiceOn}
          onChange={(e) => setEnteredServiceOn(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Expected retirement date</span>
        <input
          type="date"
          value={expectedRetirementOn}
          onChange={(e) => setExpectedRetirementOn(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Reason for this correction</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
        className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Request correction'}
      </button>
    </form>
  )
}
