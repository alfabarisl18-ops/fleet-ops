import { useEffect, useState } from 'react'
import { CorrectionPanel } from '@/components/CorrectionPanel'
import { BALANCE_STATUS_LABELS, DRIVER_STATUS_LABELS, OWNERSHIP_TRANSFER_STATUS_LABELS, PAYMENT_FREQUENCY_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { AppRole } from '@/data/auth'
import type { Correction } from '@/data/corrections'
import { fetchPendingCorrection, requestCorrection } from '@/data/corrections'
import type { OutstandingBalance } from '@/data/dailyPayments'
import { fetchOutstandingBalancesForDriver } from '@/data/dailyPayments'
import type { AssignmentHistoryItem, DriverDeletePreview, DriverDetail } from '@/data/drivers'
import {
  assignDriverToVehicle,
  deleteDriver,
  fetchAssignmentHistory,
  fetchDriver,
  fetchDriverDeletePreview,
  fetchOutstandingBalanceForDriver,
} from '@/data/drivers'
import type { DriverPurchaseAgreement } from '@/data/driverPurchaseAgreements'
import { fetchAgreementsForDriver } from '@/data/driverPurchaseAgreements'
import type { RouteOption, VehicleListItem } from '@/data/vehicles'
import { fetchRoutes, fetchVehicles } from '@/data/vehicles'

interface DriverProfileScreenProps {
  driverId: string
  currentUserId: string
  currentUserRole: AppRole
  onBack: () => void
  onOpenVehicle: (vehicleId: string) => void
  /** Set when arriving from a BALANCE_OUTSTANDING alert (Phase 7) — scrolls
   *  to and highlights the matching row in the balance-history list below,
   *  since there's no standalone balance screen for the alert to open. */
  highlightBalanceId?: string
}

export function DriverProfileScreen({
  driverId,
  currentUserId,
  currentUserRole,
  onBack,
  onOpenVehicle,
  highlightBalanceId,
}: DriverProfileScreenProps) {
  const [driver, setDriver] = useState<DriverDetail | null>(null)
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([])
  const [owedMinor, setOwedMinor] = useState<number | null>(null)
  const [balances, setBalances] = useState<OutstandingBalance[]>([])
  const [agreement, setAgreement] = useState<DriverPurchaseAgreement | null>(null)
  const [pendingCorrection, setPendingCorrection] = useState<Correction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchDriver(driverId),
      fetchAssignmentHistory(driverId),
      fetchOutstandingBalanceForDriver(driverId),
      fetchOutstandingBalancesForDriver(driverId),
      fetchAgreementsForDriver(driverId),
      fetchPendingCorrection('DRIVER', driverId),
    ])
      .then(([d, h, owed, balanceList, agreements, correction]) => {
        if (cancelled) return
        setDriver(d)
        setHistory(h)
        setOwedMinor(owed)
        setBalances(balanceList)
        setAgreement(agreements[0] ?? null)
        setPendingCorrection(correction)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this driver. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [driverId, reloadKey])

  useEffect(() => {
    if (!highlightBalanceId || balances.length === 0) return
    document.getElementById(`balance-${highlightBalanceId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightBalanceId, balances])

  // A failed background reload (e.g. after a new assignment) shouldn't wipe
  // an already-loaded profile off the screen — only block on error before
  // anything has loaded yet.
  if (error && !driver) {
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

  if (!driver) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  const currentAssignment = history.find((h) => h.endedOn === null) ?? null

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="text-xl font-semibold text-slate-900">{driver.fullName}</h1>
      <p className="mb-4 text-sm text-slate-500">
        {DRIVER_STATUS_LABELS[driver.status]}
        {driver.knownAs ? ` · ${driver.knownAs}` : ''}
      </p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <Section title="Contact">
        <Field label="Phone" value={driver.phone} />
        <Field label="Alternate phone" value={driver.phoneAlt} />
        <Field label="Address" value={driver.address} />
        <Field label="Next of kin" value={driver.nextOfKinName} />
        <Field label="Next of kin phone" value={driver.nextOfKinPhone} />
        <CorrectionPanel
          currentUserRole={currentUserRole}
          pending={pendingCorrection}
          onChanged={() => setReloadKey((k) => k + 1)}
          renderRequestForm={(onDone) => (
            <RequestDriverCorrectionForm driver={driver} currentUserId={currentUserId} onRequested={onDone} />
          )}
        />
      </Section>

      <Section title="Documents">
        <Field label="ID document type" value={driver.idDocumentType} />
        <Field label="ID document number" value={driver.idDocumentNumber} />
        <Field label="Licence number" value={driver.licenceNumber} />
        <Field label="Licence expiry" value={driver.licenceExpiry} />
      </Section>

      <Section title="Employment">
        <Field label="Started" value={driver.startedOn} />
        <Field label="Left" value={driver.leftOn} />
        <Field label="Leave reason" value={driver.leaveReason} />
      </Section>

      <Section title="Vehicle assignment">
        {currentAssignment ? (
          <button type="button" onClick={() => onOpenVehicle(currentAssignment.vehicleId)} className="text-left">
            <span className="font-medium text-slate-900 underline decoration-slate-300">
              {currentAssignment.vehicleFleetId}
            </span>
            {currentAssignment.routeName && <span className="ml-2 text-sm text-slate-500">{currentAssignment.routeName}</span>}
          </button>
        ) : (
          <p className="text-sm text-slate-500">Not currently assigned to a vehicle.</p>
        )}

        <AssignVehiclePanel driverId={driver.id} onAssigned={() => setReloadKey((k) => k + 1)} />

        {history.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Assignment history</h3>
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between text-sm">
                  <button type="button" onClick={() => onOpenVehicle(h.vehicleId)} className="text-slate-900 underline decoration-slate-300">
                    {h.vehicleFleetId}
                  </button>
                  <span className="text-slate-500">
                    {h.startedOn} – {h.endedOn ?? 'present'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Money">
        <Field label="Current amount owed" value={owedMinor !== null ? formatMinorUnits(owedMinor) : null} />

        {balances.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Balance history</h3>
            <ul className="flex flex-col gap-1">
              {balances.map((b) => (
                <li
                  key={b.id}
                  id={`balance-${b.id}`}
                  className={`flex justify-between rounded text-sm ${
                    b.id === highlightBalanceId ? 'bg-amber-50 ring-2 ring-amber-300' : ''
                  }`}
                >
                  <span className="text-slate-700">
                    {formatMinorUnits(b.remainingAmountMinor)}
                    {b.remainingAmountMinor !== b.originalAmountMinor && (
                      <span className="text-slate-400"> of {formatMinorUnits(b.originalAmountMinor)}</span>
                    )}
                  </span>
                  <span className="text-slate-500">
                    {BALANCE_STATUS_LABELS[b.status]}
                    {b.closedAt ? ` · ${b.closedAt.slice(0, 10)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {agreement && (
          <>
            <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Driver-purchase agreement
            </h3>
            <Field label="Agreement amount" value={formatMinorUnits(agreement.agreementAmountMinor)} />
            <Field
              label="Regular payment"
              value={`${formatMinorUnits(agreement.regularPaymentMinor)} (${PAYMENT_FREQUENCY_LABELS[agreement.paymentFrequency]})`}
            />
            <Field label="Started" value={agreement.startedOn} />
            <Field label="Ownership transfer" value={OWNERSHIP_TRANSFER_STATUS_LABELS[agreement.ownershipTransferStatus]} />
          </>
        )}
      </Section>

      <Section title="Notes">
        <p className="text-sm text-slate-700">{driver.notes ?? '—'}</p>
      </Section>

      {currentUserRole === 'OWNER_ADMIN' && (
        <div className="mt-8 border-t border-slate-200 pt-4">
          <DeleteDriverSection driverId={driver.id} driverName={driver.fullName} onDeleted={onBack} />
        </div>
      )}
    </div>
  )
}

/**
 * Owner/Admin only (also enforced server-side by public.delete_driver —
 * this is UI convenience, not the real boundary). Deleting cascades
 * driver_assignments and driver_purchase_agreements — see decision 0008 —
 * so the confirm step names exactly what else disappears rather than a
 * bare "are you sure."
 */
function DeleteDriverSection({
  driverId,
  driverName,
  onDeleted,
}: {
  driverId: string
  driverName: string
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [preview, setPreview] = useState<DriverDeletePreview | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startConfirm() {
    setError(null)
    try {
      const p = await fetchDriverDeletePreview(driverId)
      setPreview(p)
      setConfirming(true)
    } catch {
      setError('Could not check this driver. Try again.')
    }
  }

  async function confirmDelete() {
    setSubmitting(true)
    setError(null)
    const result = await deleteDriver(driverId)
    setSubmitting(false)
    if (!result.ok) {
      setError('Could not delete this driver. Try again.')
      return
    }
    onDeleted()
  }

  if (!confirming) {
    return (
      <button type="button" onClick={startConfirm} className="text-sm font-medium text-red-600">
        Delete driver
      </button>
    )
  }

  const cascadeParts: string[] = []
  if (preview && preview.assignmentCount > 0) {
    cascadeParts.push(`${preview.assignmentCount} vehicle assignment${preview.assignmentCount === 1 ? '' : 's'}`)
  }
  if (preview && preview.agreementCount > 0) {
    cascadeParts.push(`${preview.agreementCount} driver-purchase agreement${preview.agreementCount === 1 ? '' : 's'}`)
  }
  const cascadeDetail = cascadeParts.length > 0 ? ` This will also permanently delete ${cascadeParts.join(' and ')}.` : ''

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-800">
        Delete {driverName}?{cascadeDetail} This can't be undone.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirmDelete}
          disabled={submitting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
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

function AssignVehiclePanel({ driverId, onAssigned }: { driverId: string; onAssigned: () => void }) {
  const [open, setOpen] = useState(false)
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [vehicleId, setVehicleId] = useState('')
  const [routeId, setRouteId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || vehicles !== null) return
    let cancelled = false
    Promise.all([fetchVehicles(), fetchRoutes()])
      .then(([v, r]) => {
        if (cancelled) return
        setVehicles(v)
        setRoutes(r)
        if (v[0]) setVehicleId(v[0].id)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load vehicles.')
      })
    return () => {
      cancelled = true
    }
  }, [open, vehicles])

  async function confirm() {
    if (vehicleId === '') {
      setError('Choose a vehicle.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await assignDriverToVehicle(driverId, vehicleId, routeId === '' ? null : routeId)
      setOpen(false)
      onAssigned()
    } catch {
      setError('Could not assign this vehicle. Try again.')
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
        Assign to vehicle
      </button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      {vehicles === null && !error && <p className="text-sm text-slate-500">Loading vehicles…</p>}
      {vehicles?.length === 0 && <p className="text-sm text-slate-500">No vehicles yet.</p>}

      {vehicles && vehicles.length > 0 && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Vehicle</span>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.fleetId} — {VEHICLE_TYPE_LABELS[v.type]}
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

      <div className="flex gap-2">
        {vehicles && vehicles.length > 0 && (
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        )}
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
 * Pre-filled with current values. Fields match apply_correction's driver
 * allow-list exactly (decision 0009); status/left_on/leave_reason are
 * deliberately not here — moving a driver to FORMER is a distinct
 * employment-status action, not a field correction. See that decision.
 */
function RequestDriverCorrectionForm({
  driver,
  currentUserId,
  onRequested,
}: {
  driver: DriverDetail
  currentUserId: string
  onRequested: () => void
}) {
  const [fullName, setFullName] = useState(driver.fullName)
  const [knownAs, setKnownAs] = useState(driver.knownAs ?? '')
  const [phone, setPhone] = useState(driver.phone ?? '')
  const [phoneAlt, setPhoneAlt] = useState(driver.phoneAlt ?? '')
  const [address, setAddress] = useState(driver.address ?? '')
  const [nextOfKinName, setNextOfKinName] = useState(driver.nextOfKinName ?? '')
  const [nextOfKinPhone, setNextOfKinPhone] = useState(driver.nextOfKinPhone ?? '')
  const [idDocumentType, setIdDocumentType] = useState(driver.idDocumentType ?? '')
  const [idDocumentNumber, setIdDocumentNumber] = useState(driver.idDocumentNumber ?? '')
  const [licenceNumber, setLicenceNumber] = useState(driver.licenceNumber ?? '')
  const [licenceExpiry, setLicenceExpiry] = useState(driver.licenceExpiry ?? '')
  const [startedOn, setStartedOn] = useState(driver.startedOn ?? '')
  const [notes, setNotes] = useState(driver.notes ?? '')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (fullName.trim() === '') {
      setError('Full name is required.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Say why this correction is needed (at least a few words).')
      return
    }

    setSubmitting(true)
    try {
      await requestCorrection({
        targetTable: 'DRIVER',
        targetId: driver.id,
        reason: reason.trim(),
        requestedBy: currentUserId,
        afterJson: {
          full_name: fullName.trim(),
          known_as: knownAs.trim() === '' ? null : knownAs.trim(),
          phone: phone.trim() === '' ? null : phone.trim(),
          phone_alt: phoneAlt.trim() === '' ? null : phoneAlt.trim(),
          address: address.trim() === '' ? null : address.trim(),
          next_of_kin_name: nextOfKinName.trim() === '' ? null : nextOfKinName.trim(),
          next_of_kin_phone: nextOfKinPhone.trim() === '' ? null : nextOfKinPhone.trim(),
          id_document_type: idDocumentType.trim() === '' ? null : idDocumentType.trim(),
          id_document_number: idDocumentNumber.trim() === '' ? null : idDocumentNumber.trim(),
          licence_number: licenceNumber.trim() === '' ? null : licenceNumber.trim(),
          licence_expiry: licenceExpiry === '' ? null : licenceExpiry,
          started_on: startedOn === '' ? null : startedOn,
          notes: notes.trim() === '' ? null : notes.trim(),
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
        <span className="text-sm font-medium text-slate-700">Full name</span>
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Name commonly used</span>
        <input
          type="text"
          value={knownAs}
          onChange={(e) => setKnownAs(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Alternate phone</span>
        <input
          type="tel"
          value={phoneAlt}
          onChange={(e) => setPhoneAlt(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Address</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Next of kin name</span>
        <input
          type="text"
          value={nextOfKinName}
          onChange={(e) => setNextOfKinName(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Next of kin phone</span>
        <input
          type="tel"
          value={nextOfKinPhone}
          onChange={(e) => setNextOfKinPhone(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">ID document type</span>
        <input
          type="text"
          value={idDocumentType}
          onChange={(e) => setIdDocumentType(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">ID document number</span>
        <input
          type="text"
          value={idDocumentNumber}
          onChange={(e) => setIdDocumentNumber(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Licence number</span>
        <input
          type="text"
          value={licenceNumber}
          onChange={(e) => setLicenceNumber(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Licence expiry</span>
        <input
          type="date"
          value={licenceExpiry}
          onChange={(e) => setLicenceExpiry(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Date started</span>
        <input
          type="date"
          value={startedOn}
          onChange={(e) => setStartedOn(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
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
