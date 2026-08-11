import { useEffect, useState } from 'react'
import { DRIVER_STATUS_LABELS, OWNERSHIP_TRANSFER_STATUS_LABELS, PAYMENT_FREQUENCY_LABELS, VEHICLE_TYPE_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { AssignmentHistoryItem, DriverDetail } from '@/data/drivers'
import { assignDriverToVehicle, fetchAssignmentHistory, fetchDriver, fetchOutstandingBalanceForDriver } from '@/data/drivers'
import type { DriverPurchaseAgreement } from '@/data/driverPurchaseAgreements'
import { fetchAgreementsForDriver } from '@/data/driverPurchaseAgreements'
import type { RouteOption, VehicleListItem } from '@/data/vehicles'
import { fetchRoutes, fetchVehicles } from '@/data/vehicles'

interface DriverProfileScreenProps {
  driverId: string
  onBack: () => void
  onOpenVehicle: (vehicleId: string) => void
}

export function DriverProfileScreen({ driverId, onBack, onOpenVehicle }: DriverProfileScreenProps) {
  const [driver, setDriver] = useState<DriverDetail | null>(null)
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([])
  const [owedMinor, setOwedMinor] = useState<number | null>(null)
  const [agreement, setAgreement] = useState<DriverPurchaseAgreement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchDriver(driverId),
      fetchAssignmentHistory(driverId),
      fetchOutstandingBalanceForDriver(driverId),
      fetchAgreementsForDriver(driverId),
    ])
      .then(([d, h, owed, agreements]) => {
        if (cancelled) return
        setDriver(d)
        setHistory(h)
        setOwedMinor(owed)
        setAgreement(agreements[0] ?? null)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this driver. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [driverId, reloadKey])

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
