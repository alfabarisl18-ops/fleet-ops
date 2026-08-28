import { useState } from 'react'
import type { AppRole } from '@/data/auth'
import type { Correction } from '@/data/corrections'
import { applyCorrection, rejectCorrection } from '@/data/corrections'

interface CorrectionPanelProps {
  currentUserRole: AppRole
  /** The one open (REQUESTED) correction for this entity, or null —
   *  fetched by the caller via fetchPendingCorrection. */
  pending: Correction | null
  onChanged: () => void
  /** The target-specific request form, given a callback to call once
   *  submitted, passed the new correction's id — a render prop rather than
   *  children, so this shared panel can close the form and trigger a
   *  reload without reaching into opaque JSX. */
  renderRequestForm: (onDone: (newCorrectionId: string) => void) => React.ReactNode
  /** Human labels for the raw snake_case keys before_json/after_json carry
   *  — every caller needs one, matching whichever correctable fields its
   *  own request form actually sends. */
  fieldLabels: Record<string, string>
  /** Per-field formatting for the changed-fields list below — falls back
   *  to String(value), or '—' for null/empty, when omitted or when a key
   *  isn't handled. Callers use this for the few fields a plain string
   *  isn't enough for (e.g. money in minor units, an id that needs
   *  resolving to a name). */
  formatFieldValue?: (key: string, value: string | number | null) => string
}

type JsonRecord = Record<string, string | number | null>

function defaultFormat(value: string | number | null): string {
  if (value === null || value === '') return '—'
  return String(value)
}

/** Keys present in after_json whose value actually differs from the
 *  matching before_json key — a correction's after_json carries every
 *  field its request form has, not just the ones that changed, so this is
 *  what actually separates signal from noise for a reviewer. A key
 *  missing from before_json (shouldn't happen in practice — every
 *  correctable field already exists on the row before_json snapshots) is
 *  treated as null rather than skipped, so it still surfaces as a change
 *  if after_json sets it. */
function changedFields(before: JsonRecord | null, after: JsonRecord | null): Array<[string, string | number | null, string | number | null]> {
  if (!after) return []
  const rows: Array<[string, string | number | null, string | number | null]> = []
  for (const key of Object.keys(after)) {
    const beforeValue = before?.[key] ?? null
    const afterValue = after[key] ?? null
    if (beforeValue !== afterValue) rows.push([key, beforeValue, afterValue])
  }
  return rows
}

/**
 * Shared between VehicleProfileScreen and DriverProfileScreen — the
 * pending-correction display and Approve/Reject actions are identical
 * regardless of target table; only the request form's fields differ.
 *
 * For Owner/Admin, requesting and approving are the same person, so
 * there's no real decision behind a second click — submitting applies the
 * correction immediately (server-side apply_correction() already does
 * approve+apply in one call, per decision 0009; this just stops making
 * Owner/Admin click twice for it). The button reads "Edit," not "Request
 * a correction," for them. Any other desktop role genuinely can't
 * self-approve (apply_correction/reject_correction are Owner/Admin-only
 * server-side) — unchanged: request, then wait for an Owner/Admin to
 * review it on this same screen.
 */
export function CorrectionPanel({
  currentUserRole,
  pending,
  onChanged,
  renderRequestForm,
  fieldLabels,
  formatFieldValue,
}: CorrectionPanelProps) {
  const isOwner = currentUserRole === 'OWNER_ADMIN'
  const [requesting, setRequesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequested(newCorrectionId: string) {
    setRequesting(false)
    if (!isOwner) {
      onChanged()
      return
    }
    try {
      await applyCorrection(newCorrectionId)
    } catch {
      // The request itself already landed — it just sits pending like a
      // normal Fleet Manager request would, rather than losing the edit.
    }
    onChanged()
  }

  async function handleApprove() {
    if (!pending) return
    setSubmitting(true)
    setError(null)
    try {
      await applyCorrection(pending.id)
      onChanged()
    } catch {
      setError('Could not approve this correction. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!pending) return
    setSubmitting(true)
    setError(null)
    try {
      await rejectCorrection(pending.id)
      onChanged()
    } catch {
      setError('Could not reject this correction. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (pending) {
    const changes = changedFields(pending.beforeJson, pending.afterJson)

    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm text-amber-800">Correction pending: {pending.reason}</p>

        {changes.length > 0 && (
          <dl className="mt-2 flex flex-col gap-1 border-t border-amber-200 pt-2">
            {changes.map(([key, before, after]) => (
              <div key={key} className="text-sm">
                <dt className="inline font-medium text-amber-900">{fieldLabels[key] ?? key}: </dt>
                <dd className="inline text-amber-800">
                  {formatFieldValue ? formatFieldValue(key, before) : defaultFormat(before)}
                  {' → '}
                  {formatFieldValue ? formatFieldValue(key, after) : defaultFormat(after)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {error && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}

        {currentUserRole === 'OWNER_ADMIN' && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Working…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={submitting}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    )
  }

  if (!requesting) {
    return (
      <button
        type="button"
        onClick={() => setRequesting(true)}
        className="mt-3 text-sm font-medium text-slate-600 underline decoration-slate-300"
      >
        {isOwner ? 'Edit' : 'Request a correction'}
      </button>
    )
  }

  return <div className="mt-3">{renderRequestForm(handleRequested)}</div>
}
