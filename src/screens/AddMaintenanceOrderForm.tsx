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

interface IssueDraft {
  key: string
  area: string
  customArea: string
  problemDescriptor: ProblemDescriptor | null
  details: string
}

function newIssue(): IssueDraft {
  return { key: crypto.randomUUID(), area: '', customArea: '', problemDescriptor: null, details: '' }
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
  const [issues, setIssues] = useState<IssueDraft[]>(() => [newIssue()])
  const [handledBy, setHandledBy] = useState<MaintenanceHandledBy | ''>('')
  const [safetyStatus, setSafetyStatus] = useState<Roadworthiness>('UNKNOWN')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoAdded, setPhotoAdded] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  function choose(nextType: MaintenanceRecordType) {
    setRecordType(nextType)
    setIssues([newIssue()])
    setError(null)
  }

  function updateIssue(key: string, change: Partial<IssueDraft>) {
    setIssues((current) => current.map((issue) => (issue.key === key ? { ...issue, ...change } : issue)))
  }

  async function submit() {
    if (!recordType) return
    setError(null)

    const normalized = issues.map((issue) => ({
      serviceArea: issue.area === 'Other' ? issue.customArea.trim() : issue.area,
      workAction: issue.area === OIL_CHANGE_SERVICE_AREA ? OIL_CHANGE_SERVICE_AREA : issue.details.trim(),
      problemDescriptor: issue.problemDescriptor,
    }))

    const missingArea = normalized.findIndex((issue) => issue.serviceArea === '')
    if (missingArea >= 0) {
      setError(`Choose an area for issue ${missingArea + 1}.`)
      return
    }
    const missingDescriptor = recordType === 'PROBLEM_REPORTED'
      ? normalized.findIndex((issue) => issue.problemDescriptor === null)
      : -1
    if (missingDescriptor >= 0) {
      setError(`Choose what is wrong for issue ${missingDescriptor + 1}.`)
      return
    }

    setSubmitting(true)
    try {
      const outcome = await createMaintenanceOrder({
        vehicleId,
        recordType,
        issues: normalized.map((issue) => ({
          serviceArea: issue.serviceArea,
          ...(issue.workAction ? { workAction: issue.workAction } : {}),
          ...(issue.problemDescriptor ? { problemDescriptor: issue.problemDescriptor } : {}),
        })),
        ...(handledBy !== '' ? { handledBy } : {}),
        safetyStatus,
        ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
      })
      if (outcome.status === 'queued') onQueued()
      else setCreatedOrderId(outcome.result)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePhotoChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
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
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading} className="rounded-2xl border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 active:bg-slate-50 disabled:opacity-50">
              {photoUploading ? 'Uploading...' : '+ Add a photo of the problem'}
            </button>
            {photoError && <p role="alert" className="text-sm text-red-600">{photoError}</p>}
          </>
        )}
        {photoAdded && <p className="text-sm text-emerald-600">Photo added.</p>}
        <button type="button" onClick={() => onCreated(createdOrderId)} className="mt-2 rounded-2xl bg-primary-600 px-6 py-3 text-base font-medium text-white">Continue</button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-sm p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">&larr; Back</button>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">{fleetId}</h1>

      {!recordType && (
        <>
          <p className="mb-3 mt-4 text-base font-medium text-slate-700">What kind of record is this?</p>
          <div className="flex flex-col gap-2">
            {RECORD_TYPES.map((item) => (
              <button key={item} type="button" onClick={() => choose(item)} className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50">
                {MAINTENANCE_RECORD_TYPE_LABELS[item]}
              </button>
            ))}
          </div>
        </>
      )}

      {recordType && (
        <div className="mt-4 flex min-w-0 flex-col gap-4">
          <p className="text-base font-medium text-slate-700">{MAINTENANCE_RECORD_TYPE_LABELS[recordType]}</p>

          {issues.map((issue, index) => (
            <section key={issue.key} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-900">Issue {index + 1}</h2>
                {issues.length > 1 && (
                  <button type="button" onClick={() => setIssues((current) => current.filter((item) => item.key !== issue.key))} className="min-h-11 px-2 text-sm font-medium text-red-600">Remove</button>
                )}
              </div>

              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Area</span>
                <select
                  value={issue.area}
                  onChange={(event) => updateIssue(issue.key, { area: event.target.value, customArea: '', details: event.target.value === OIL_CHANGE_SERVICE_AREA ? OIL_CHANGE_SERVICE_AREA : issue.details })}
                  className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
                >
                  <option value="" disabled>Choose one</option>
                  {recordType === 'REGULAR_SERVICE' && <option value={OIL_CHANGE_SERVICE_AREA}>Oil Change</option>}
                  {MAINTENANCE_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
              </label>

              {issue.area === 'Other' && (
                <label className="mt-3 flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">Other area</span>
                  <input value={issue.customArea} onChange={(event) => updateIssue(issue.key, { customArea: event.target.value })} placeholder="Describe the area" className="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-3 text-base" />
                </label>
              )}

              {recordType === 'PROBLEM_REPORTED' && (
                <label className="mt-3 flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">What's wrong</span>
                  <select value={issue.problemDescriptor ?? ''} onChange={(event) => updateIssue(issue.key, { problemDescriptor: event.target.value as ProblemDescriptor })} className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
                    <option value="" disabled>Choose one</option>
                    {PROBLEM_DESCRIPTORS.map((descriptor) => <option key={descriptor} value={descriptor}>{PROBLEM_DESCRIPTOR_LABELS[descriptor]}</option>)}
                  </select>
                </label>
              )}

              {issue.area !== OIL_CHANGE_SERVICE_AREA && (
                <label className="mt-3 flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">
                    {recordType === 'PROBLEM_REPORTED' ? 'Problem description (optional)' : 'Work done (optional)'}
                  </span>
                  <textarea value={issue.details} onChange={(event) => updateIssue(issue.key, { details: event.target.value })} rows={2} className="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-3 text-base" />
                </label>
              )}
            </section>
          ))}

          <button type="button" onClick={() => setIssues((current) => [...current, newIssue()])} className="min-h-11 rounded-xl border border-primary-300 px-4 py-3 font-medium text-primary-700">+ Add another issue</button>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Handled by (optional)</span>
            <select value={handledBy} onChange={(event) => setHandledBy(event.target.value as MaintenanceHandledBy | '')} className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
              <option value="">Not set</option>
              {HANDLED_BY_OPTIONS.map((item) => <option key={item} value={item}>{MAINTENANCE_HANDLED_BY_LABELS[item]}</option>)}
            </select>
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Vehicle condition</span>
            <select value={safetyStatus} onChange={(event) => setSafetyStatus(event.target.value as Roadworthiness)} className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
              {SAFETY_OPTIONS.map((item) => <option key={item} value={item}>{ROADWORTHINESS_LABELS[item]}</option>)}
            </select>
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-3 text-base" />
          </label>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="button" onClick={submit} disabled={submitting} className="rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
