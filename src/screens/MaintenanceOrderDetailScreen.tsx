import { useEffect, useState } from 'react'
import {
  FILTER_ACTION_LABELS,
  MAINTENANCE_HANDLED_BY_LABELS,
  MAINTENANCE_RECORD_TYPE_LABELS,
  MAINTENANCE_STATUS_LABELS,
  PART_SOURCE_LABELS,
  PROBLEM_DESCRIPTOR_LABELS,
  ROADWORTHINESS_LABELS,
} from '@/constants/labels'
import { formatMinorUnits, parseMinorUnits } from '@/lib/money'
import type { AppRole } from '@/data/auth'
import type {
  FilterAction,
  MaintenanceNote,
  MaintenanceOrderDetail,
  MaintenancePart,
  MaintenanceStatus,
  MaintenanceStatusEvent,
  PartSource,
} from '@/data/maintenance'
import {
  addMaintenanceNote,
  changeMaintenanceStatus,
  fetchMaintenanceNotes,
  fetchMaintenanceOrder,
  fetchMaintenanceParts,
  fetchMaintenanceStatusHistory,
  recordMaintenancePart,
  toggleOldPartsReturned,
  updateMaintenanceReminder,
} from '@/data/maintenance'

interface MaintenanceOrderDetailScreenProps {
  orderId: string
  currentUserId: string
  currentUserRole: AppRole
  onBack: () => void
  /** Omitted on mobile — there is no vehicle profile screen there, so the
   *  fleet ID renders as plain text instead of a dead-end button. */
  onOpenVehicle?: (vehicleId: string) => void
}

const MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  'PROBLEM_REPORTED',
  'INSPECTION_PENDING',
  'REPAIR_AUTHORIZED',
  'REPAIR_IN_PROGRESS',
  'STILL_GROUNDED',
  'RETURNED_TO_SERVICE',
  'ADDITIONAL_PROBLEM_FOUND',
  'COMPLETED_AND_VERIFIED',
]

const PART_SOURCES: PartSource[] = ['NONE', 'NEW', 'USED', 'EXISTING_REPAIRED']
const FILTER_ACTIONS: FilterAction[] = ['NEW_FILTER', 'REUSED', 'NOT_CHANGED']

function isDesktopRole(role: AppRole): boolean {
  return role === 'OWNER_ADMIN' || role === 'FLEET_MANAGER'
}

/**
 * Used by both DesktopWorkspace and MaintenanceWorkspace (Phase 6 plan,
 * "shared screens") — status changes, parts, and notes are all open to
 * both is_desktop() and is_maintenance() callers per RLS. The one
 * desktop-only action, old_parts_returned, is gated on currentUserRole
 * the same way DriverProfileScreen gates its delete action.
 */
export function MaintenanceOrderDetailScreen({
  orderId,
  currentUserId,
  currentUserRole,
  onBack,
  onOpenVehicle,
}: MaintenanceOrderDetailScreenProps) {
  const [order, setOrder] = useState<MaintenanceOrderDetail | null>(null)
  const [history, setHistory] = useState<MaintenanceStatusEvent[]>([])
  const [parts, setParts] = useState<MaintenancePart[]>([])
  const [notes, setNotes] = useState<MaintenanceNote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchMaintenanceOrder(orderId),
      fetchMaintenanceStatusHistory(orderId),
      fetchMaintenanceParts(orderId),
      fetchMaintenanceNotes(orderId),
    ])
      .then(([o, h, p, n]) => {
        if (cancelled) return
        setOrder(o)
        setHistory(h)
        setParts(p)
        setNotes(n)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this record. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [orderId, reloadKey])

  if (error && !order) {
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

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  const partsTotalMinor = parts.reduce((sum, p) => sum + p.quantity * p.unitCostMinor, 0)
  const reload = () => setReloadKey((k) => k + 1)

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <p className="mb-1 text-sm text-slate-500">{MAINTENANCE_RECORD_TYPE_LABELS[order.recordType]}</p>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">
        {onOpenVehicle ? (
          <button type="button" onClick={() => onOpenVehicle(order.vehicleId)} className="underline decoration-slate-300">
            {order.vehicleFleetId}
          </button>
        ) : (
          order.vehicleFleetId
        )}
        <span className="ml-2 font-normal text-slate-500">
          {order.serviceArea === 'OIL_CHANGE' ? 'Oil Change' : order.serviceArea}
        </span>
      </h1>
      <p className="mb-4 text-sm text-slate-500">Identified {order.identifiedOn}</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <Section title="Status">
        <StatusControl order={order} currentUserId={currentUserId} onChanged={reload} />
        {history.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">History</h3>
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="text-slate-700">{MAINTENANCE_STATUS_LABELS[h.toStatus]}</span>
                  <span className="ml-2 text-slate-400">{h.changedAt.slice(0, 10)}</span>
                  {h.note && <span className="block text-xs text-slate-500">{h.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Details">
        <Field label="Work action" value={order.workAction === 'OIL_CHANGE' ? 'Oil Change' : order.workAction} />
        <Field label="Problem" value={order.problemDescriptor ? PROBLEM_DESCRIPTOR_LABELS[order.problemDescriptor] : null} />
        <Field label="Handled by" value={order.handledBy ? MAINTENANCE_HANDLED_BY_LABELS[order.handledBy] : null} />
        <Field label="Vehicle condition" value={ROADWORTHINESS_LABELS[order.safetyStatus]} />
        <Field label="Grounded" value={order.isGrounded ? 'Yes' : 'No'} />
        <Field label="Notes" value={order.notes} />
      </Section>

      {isDesktopRole(currentUserRole) && (
        <Section title="Reminder">
          <ReminderPanel order={order} onSaved={reload} />
        </Section>
      )}

      <Section title="Parts">
        {parts.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {parts.map((p) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span className="text-slate-700">
                  {p.partName}
                  {p.quantity > 1 ? ` × ${p.quantity}` : ''}
                  {p.filterAction && <span className="text-slate-400"> · {FILTER_ACTION_LABELS[p.filterAction]}</span>}
                </span>
                <span className="text-slate-900">{formatMinorUnits(p.quantity * p.unitCostMinor)}</span>
              </li>
            ))}
          </ul>
        )}
        {parts.length > 0 && (
          <p className="mb-3 flex justify-between border-t border-slate-100 pt-2 text-sm font-medium">
            <span className="text-slate-500">Total</span>
            <span className="text-slate-900">{formatMinorUnits(partsTotalMinor)}</span>
          </p>
        )}
        <AddPartPanel orderId={order.id} onAdded={reload} />

        {isDesktopRole(currentUserRole) && (
          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={order.oldPartsReturned === true}
              onChange={async (e) => {
                await toggleOldPartsReturned(order.id, e.target.checked)
                reload()
              }}
              className="h-5 w-5"
            />
            Old parts returned
          </label>
        )}
      </Section>

      <Section title="Notes">
        {notes.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className="text-sm">
                <p className="text-slate-700">{n.bodyText}</p>
                <p className="text-xs text-slate-400">{n.enteredAt.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        )}
        <AddNotePanel orderId={order.id} currentUserId={currentUserId} onAdded={reload} />
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

function StatusControl({
  order,
  currentUserId,
  onChanged,
}: {
  order: MaintenanceOrderDetail
  currentUserId: string
  onChanged: () => void
}) {
  const [target, setTarget] = useState<MaintenanceStatus | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!target) return
    setSubmitting(true)
    setError(null)
    try {
      await changeMaintenanceStatus(order.id, target, currentUserId, note.trim() === '' ? undefined : note.trim())
      setTarget(null)
      setNote('')
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
        <span className="font-medium text-slate-900">{MAINTENANCE_STATUS_LABELS[order.status]}</span>
      </p>

      {!target && (
        <div className="flex flex-wrap gap-2">
          {MAINTENANCE_STATUSES.filter((s) => s !== order.status).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTarget(s)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
            >
              {MAINTENANCE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {target && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <p className="text-sm text-slate-700">
            Change status to <span className="font-medium">{MAINTENANCE_STATUS_LABELS[target]}</span>
          </p>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
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

/**
 * Desktop-only (gated by the caller). Closes the Phase 6 gap Phase 7's
 * alerts depend on — without a reminder date or expected completion date
 * set, MAINTENANCE_DUE/MAINTENANCE_OVERDUE can never fire for this order.
 */
function ReminderPanel({ order, onSaved }: { order: MaintenanceOrderDetail; onSaved: () => void }) {
  const [reminderDate, setReminderDate] = useState(order.reminderDate ?? '')
  const [expectedCompletionOn, setExpectedCompletionOn] = useState(order.expectedCompletionOn ?? '')
  const [estimatedGroundedDays, setEstimatedGroundedDays] = useState(
    order.estimatedGroundedDays !== null ? String(order.estimatedGroundedDays) : '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    setError(null)
    setSaved(false)

    const days = estimatedGroundedDays.trim() === '' ? null : Number(estimatedGroundedDays)
    if (days !== null && (!Number.isInteger(days) || days < 0)) {
      setError('Enter a valid number of days.')
      return
    }

    setSubmitting(true)
    try {
      await updateMaintenanceReminder(order.id, {
        reminderDate: reminderDate === '' ? null : reminderDate,
        expectedCompletionOn: expectedCompletionOn === '' ? null : expectedCompletionOn,
        estimatedGroundedDays: days,
      })
      setSaved(true)
      onSaved()
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Reminder date</span>
        <input
          type="date"
          value={reminderDate}
          onChange={(e) => setReminderDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Expected completion date</span>
        <input
          type="date"
          value={expectedCompletionOn}
          onChange={(e) => setExpectedCompletionOn(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Estimated days grounded</span>
        <input
          type="number"
          min={0}
          value={estimatedGroundedDays}
          onChange={(e) => setEstimatedGroundedDays(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && !submitting && <p className="text-sm text-emerald-600">Saved.</p>}

      <button
        type="button"
        onClick={save}
        disabled={submitting}
        className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function AddPartPanel({ orderId, onAdded }: { orderId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [partName, setPartName] = useState('')
  const [partSource, setPartSource] = useState<PartSource>('NEW')
  const [filterAction, setFilterAction] = useState<FilterAction>('NOT_CHANGED')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const qty = Number(quantity)
    const unitCostMinor = unitCost.trim() === '' ? 0 : parseMinorUnits(unitCost)

    if (partName.trim() === '') {
      setError('Enter the part name.')
      return
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    if (unitCostMinor === null) {
      setError('Enter a valid unit cost.')
      return
    }

    setSubmitting(true)
    try {
      await recordMaintenancePart({
        orderId,
        partName: partName.trim(),
        partSource,
        filterAction,
        quantity: qty,
        unitCostMinor,
      })
      setOpen(false)
      setPartName('')
      setQuantity('1')
      setUnitCost('')
      onAdded()
    } catch {
      setError('Could not add this part. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
      >
        + Add part
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Part name</span>
        <input
          type="text"
          autoFocus
          value={partName}
          onChange={(e) => setPartName(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Source</span>
        <select
          value={partSource}
          onChange={(e) => setPartSource(e.target.value as PartSource)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {PART_SOURCES.map((s) => (
            <option key={s} value={s}>
              {PART_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Filter</span>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value as FilterAction)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {FILTER_ACTIONS.map((f) => (
            <option key={f} value={f}>
              {FILTER_ACTION_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Quantity</span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Unit cost</span>
          <input
            type="text"
            inputMode="decimal"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="0.00"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Add'}
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

function AddNotePanel({ orderId, currentUserId, onAdded }: { orderId: string; currentUserId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (body.trim() === '') {
      setError('Write a note first.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await addMaintenanceNote(orderId, body.trim(), currentUserId)
      setBody('')
      setOpen(false)
      onAdded()
    } catch {
      setError('Could not save this note. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
      >
        + Add note
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
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
          onClick={submit}
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Add'}
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
