import { useEffect, useRef, useState } from 'react'
import {
  MAINTENANCE_HANDLED_BY_LABELS,
  MAINTENANCE_RECORD_TYPE_LABELS,
  PROBLEM_DESCRIPTOR_LABELS,
  ROADWORTHINESS_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/constants/labels'
import { uploadDocument, validateDocumentFile } from '@/lib/documents'
import type { MaintenanceHandledBy, MaintenanceRecordType, ProblemDescriptor, Roadworthiness } from '@/data/maintenance'
import { MAINTENANCE_AREAS, OIL_CHANGE_SERVICE_AREA, createMaintenanceOrder } from '@/data/maintenance'
import type { VehicleListItem, VehicleType } from '@/data/vehicles'
import { fetchVehicles } from '@/data/vehicles'

interface AddMaintenanceOrderFormProps {
  currentUserId: string
  onCreated: (orderId: string) => void
  /** Saved locally, no signal yet (Phase 9) — no order id exists
   *  server-side until the queue flushes, so there's nowhere real to
   *  navigate to; the caller just returns to a list. */
  onQueued: () => void
  onCancel: () => void
}

// SPEC section 4: "Problem Reported, Regular Service, Repair (in that order)."
const RECORD_TYPES: MaintenanceRecordType[] = ['PROBLEM_REPORTED', 'REGULAR_SERVICE', 'REPAIR']
const HANDLED_BY_OPTIONS: MaintenanceHandledBy[] = ['FAMILY_WORKSHOP', 'APPROVED_MECHANIC', 'PARK_MECHANIC', 'OTHER']
const SAFETY_OPTIONS: Roadworthiness[] = ['ROADWORTHY', 'LIMITED_USE', 'NOT_ROADWORTHY', 'UNKNOWN']
const PROBLEM_DESCRIPTORS: ProblemDescriptor[] = [
  'NOT_WORKING',
  'WORN',
  'DAMAGED',
  'MAKING_NOISE',
  'LEAKING',
  'WEAK_PERFORMANCE',
  'NEEDS_INSPECTION',
  'NEEDS_REPLACEMENT',
  'INTERMITTENT_PROBLEM',
  'OTHER',
]

type Step = { name: 'pick-vehicle' } | { name: 'details'; vehicleId: string; fleetId: string }

/**
 * Used by both DesktopWorkspace and MaintenanceWorkspace — same fields, same
 * actions, for both is_desktop() and is_maintenance() callers, matching
 * what RLS already allows both roles to do (Phase 6 plan, "shared screens").
 * No date field: identified_on is a server-side business date, never picked
 * on the client (CLAUDE.md).
 */
export function AddMaintenanceOrderForm({ currentUserId, onCreated, onQueued, onCancel }: AddMaintenanceOrderFormProps) {
  const [step, setStep] = useState<Step>({ name: 'pick-vehicle' })

  if (step.name === 'details') {
    return (
      <OrderDetailsForm
        vehicleId={step.vehicleId}
        fleetId={step.fleetId}
        currentUserId={currentUserId}
        onCreated={onCreated}
        onQueued={onQueued}
        onBack={() => setStep({ name: 'pick-vehicle' })}
      />
    )
  }

  return <VehiclePicker onChoose={(vehicleId, fleetId) => setStep({ name: 'details', vehicleId, fleetId })} onCancel={onCancel} />
}

function VehiclePicker({ onChoose, onCancel }: { onChoose: (vehicleId: string, fleetId: string) => void; onCancel: () => void }) {
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null)
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

  const grouped = new Map<VehicleType, VehicleListItem[]>()
  for (const v of vehicles ?? []) {
    const list = grouped.get(v.type) ?? []
    list.push(v)
    grouped.set(v.type, list)
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-4 text-lg font-semibold text-slate-900">New maintenance record</h1>
      <p className="mb-4 text-sm text-slate-600">Which vehicle?</p>

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
                  onClick={() => onChoose(v.id, v.fleetId)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
                >
                  {v.fleetId}
                  {v.plate ? <span className="ml-2 text-sm font-normal text-slate-500">{v.plate}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function OrderDetailsForm({
  vehicleId,
  fleetId,
  currentUserId,
  onCreated,
  onQueued,
  onBack,
}: {
  vehicleId: string
  fleetId: string
  currentUserId: string
  onCreated: (orderId: string) => void
  onQueued: () => void
  onBack: () => void
}) {
  const [recordType, setRecordType] = useState<MaintenanceRecordType | null>(null)
  const [isOilChange, setIsOilChange] = useState(false)
  const [serviceArea, setServiceArea] = useState('')
  const [customArea, setCustomArea] = useState('')
  const [workAction, setWorkAction] = useState('')
  const [problemDescriptor, setProblemDescriptor] = useState<ProblemDescriptor | null>(null)
  const [handledBy, setHandledBy] = useState<MaintenanceHandledBy | ''>('')
  const [safetyStatus, setSafetyStatus] = useState<Roadworthiness>('UNKNOWN')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Set only once the order is actually created online — the id a
  // problem photo attaches to. A queued (offline) write has no id yet,
  // so it skips straight to onQueued() as before; there's nothing to
  // attach a photo to until the write really lands.
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoAdded, setPhotoAdded] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  function choose(rt: MaintenanceRecordType) {
    setRecordType(rt)
    setIsOilChange(false)
    setServiceArea('')
    setCustomArea('')
    setWorkAction('')
    setProblemDescriptor(null)
    setError(null)
  }

  async function submit() {
    if (!recordType) return
    setError(null)

    const finalServiceArea = isOilChange ? OIL_CHANGE_SERVICE_AREA : serviceArea === 'Other' ? customArea.trim() : serviceArea
    const finalWorkAction = isOilChange ? OIL_CHANGE_SERVICE_AREA : workAction.trim()

    if (finalServiceArea === '') {
      setError('Enter the area this record is about.')
      return
    }
    if (recordType === 'PROBLEM_REPORTED' && problemDescriptor === null) {
      setError('Choose what is wrong.')
      return
    }

    setSubmitting(true)
    try {
      const outcome = await createMaintenanceOrder({
        vehicleId,
        recordType,
        serviceArea: finalServiceArea,
        ...(finalWorkAction !== '' ? { workAction: finalWorkAction } : {}),
        ...(problemDescriptor ? { problemDescriptor } : {}),
        ...(handledBy !== '' ? { handledBy } : {}),
        safetyStatus,
        ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
        openedBy: currentUserId,
      })
      if (outcome.status === 'queued') {
        onQueued()
      } else {
        setCreatedOrderId(outcome.result)
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !createdOrderId) return

    const validationError = validateDocumentFile(file)
    if (validationError) {
      setPhotoError(validationError)
      return
    }

    setPhotoUploading(true)
    setPhotoError(null)
    try {
      await uploadDocument({
        ownerType: 'MAINTENANCE_ORDER',
        ownerId: createdOrderId,
        docType: 'OTHER',
        file,
        uploadedBy: currentUserId,
      })
      setPhotoAdded(true)
    } catch {
      setPhotoError('Could not upload this photo. Try again.')
    } finally {
      setPhotoUploading(false)
    }
  }

  if (createdOrderId) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold text-slate-900">Saved</p>
        <p className="text-sm text-slate-500">{fleetId}</p>

        {!photoAdded && (
          <>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChosen} className="hidden" />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              className="rounded-2xl border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 active:bg-slate-50 disabled:opacity-50"
            >
              {photoUploading ? 'Uploading…' : '+ Add a photo of the problem'}
            </button>
            {photoError && (
              <p role="alert" className="text-sm text-red-600">
                {photoError}
              </p>
            )}
          </>
        )}
        {photoAdded && <p className="text-sm text-emerald-600">Photo added.</p>}

        <button
          type="button"
          onClick={() => onCreated(createdOrderId)}
          className="mt-2 rounded-2xl bg-primary-600 px-6 py-3 text-base font-medium text-white"
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="mb-1 text-lg font-semibold text-slate-900">{fleetId}</h1>

      {!recordType && (
        <>
          <p className="mb-3 mt-4 text-base font-medium text-slate-700">What kind of record is this?</p>
          <div className="flex flex-col gap-2">
            {RECORD_TYPES.map((rt) => (
              <button
                key={rt}
                type="button"
                onClick={() => choose(rt)}
                className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
              >
                {MAINTENANCE_RECORD_TYPE_LABELS[rt]}
              </button>
            ))}
          </div>
        </>
      )}

      {recordType && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-base font-medium text-slate-700">{MAINTENANCE_RECORD_TYPE_LABELS[recordType]}</p>

          {recordType === 'REGULAR_SERVICE' && (
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isOilChange}
                onChange={(e) => {
                  setIsOilChange(e.target.checked)
                  setServiceArea('')
                  setWorkAction('')
                }}
                className="h-5 w-5"
              />
              Oil Change
            </label>
          )}

          {!isOilChange && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Area</span>
              <select
                autoFocus
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
              >
                <option value="" disabled>
                  Choose one
                </option>
                {MAINTENANCE_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
              {serviceArea === 'Other' && (
                <input
                  type="text"
                  autoFocus
                  value={customArea}
                  onChange={(e) => setCustomArea(e.target.value)}
                  placeholder="Describe the area"
                  className="mt-1 rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              )}
            </label>
          )}

          {recordType === 'PROBLEM_REPORTED' && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">What's wrong</span>
              <select
                value={problemDescriptor ?? ''}
                onChange={(e) => setProblemDescriptor(e.target.value as ProblemDescriptor)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
              >
                <option value="" disabled>
                  Choose one
                </option>
                {PROBLEM_DESCRIPTORS.map((d) => (
                  <option key={d} value={d}>
                    {PROBLEM_DESCRIPTOR_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!isOilChange && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">
                {recordType === 'PROBLEM_REPORTED' ? 'Problem identified (optional)' : 'Work done (optional)'}
              </span>
              <textarea
                value={workAction}
                onChange={(e) => setWorkAction(e.target.value)}
                rows={2}
                className="rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Handled by (optional)</span>
            <select
              value={handledBy}
              onChange={(e) => setHandledBy(e.target.value as MaintenanceHandledBy | '')}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
            >
              <option value="">Not set</option>
              {HANDLED_BY_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {MAINTENANCE_HANDLED_BY_LABELS[h]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Vehicle condition</span>
            <select
              value={safetyStatus}
              onChange={(e) => setSafetyStatus(e.target.value as Roadworthiness)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
            >
              {SAFETY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {ROADWORTHINESS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
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
            className="rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
