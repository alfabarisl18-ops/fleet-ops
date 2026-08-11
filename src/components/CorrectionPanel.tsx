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
   *  submitted — a render prop rather than children, so this shared panel
   *  can close the form and trigger a reload without reaching into
   *  opaque JSX. */
  renderRequestForm: (onDone: () => void) => React.ReactNode
}

/**
 * Shared between VehicleProfileScreen and DriverProfileScreen — the
 * pending-correction display and Approve/Reject actions are identical
 * regardless of target table; only the request form's fields differ. Same
 * "one action, real consequence" pattern as VehicleProfileScreen's
 * StatusControl: Approve/Reject are Owner/Admin only, enforced again
 * server-side inside apply_correction/reject_correction.
 */
export function CorrectionPanel({ currentUserRole, pending, onChanged, renderRequestForm }: CorrectionPanelProps) {
  const [requesting, setRequesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm text-amber-800">Correction pending: {pending.reason}</p>

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
        Request a correction
      </button>
    )
  }

  return (
    <div className="mt-3">
      {renderRequestForm(() => {
        setRequesting(false)
        onChanged()
      })}
    </div>
  )
}
