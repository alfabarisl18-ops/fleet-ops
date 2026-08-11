import { useEffect, useState } from 'react'
import { recordTypeLabel } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { AppRole } from '@/data/auth'
import type { ActivityRecord } from '@/data/activityRecords'
import { fetchActivityRecord } from '@/data/activityRecords'
import type { DailyPaymentRecord } from '@/data/dailyPayments'
import { fetchDailyPaymentRecord, overrideShortfallTreatment } from '@/data/dailyPayments'
import { supabase } from '@/lib/supabase'

interface RecordDetailScreenProps {
  recordId: string
  currentUserRole: AppRole
  onBack: () => void
  onOpenVehicle: (vehicleId: string) => void
  onOpenDriver: (driverId: string) => void
}

/**
 * SPEC section 4's Records page: "Every record clickable → read-only
 * detail showing vehicle, driver, dates, amount, ... notes, who entered
 * it, actual entry/payment date, and the date the record applies to."
 * Payment status, remaining balance, maintenance description, parts and
 * labour, and trip information are also on SPEC's list but don't apply to
 * any record type this phase writes — Phase 5/6's job, not faked here.
 */
export function RecordDetailScreen({ recordId, currentUserRole, onBack, onOpenVehicle, onOpenDriver }: RecordDetailScreenProps) {
  const [record, setRecord] = useState<ActivityRecord | null>(null)
  const [vehicleFleetId, setVehicleFleetId] = useState<string | null>(null)
  const [driverName, setDriverName] = useState<string | null>(null)
  const [enteredByName, setEnteredByName] = useState<string | null>(null)
  const [dailyPayment, setDailyPayment] = useState<DailyPaymentRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchActivityRecord(recordId)
      .then(async (r) => {
        if (cancelled || !r) return
        setRecord(r)

        if (r.recordType === 'DAILY_PAYMENT_RECORDED') {
          fetchDailyPaymentRecord(r.targetId)
            .then((dpr) => {
              if (!cancelled) setDailyPayment(dpr)
            })
            .catch(() => {
              /* Override action just won't be offered; the rest of the page still works. */
            })
        }

        const lookups: PromiseLike<void>[] = [
          supabase
            .from('users')
            .select('display_name')
            .eq('id', r.enteredBy)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled) setEnteredByName(data?.display_name ?? null)
            }),
        ]
        if (r.vehicleId) {
          lookups.push(
            supabase
              .from('vehicles')
              .select('fleet_id')
              .eq('id', r.vehicleId)
              .maybeSingle()
              .then(({ data }) => {
                if (!cancelled) setVehicleFleetId(data?.fleet_id ?? null)
              }),
          )
        }
        if (r.driverId) {
          lookups.push(
            supabase
              .from('drivers')
              .select('full_name')
              .eq('id', r.driverId)
              .maybeSingle()
              .then(({ data }) => {
                if (!cancelled) setDriverName(data?.full_name ?? null)
              }),
          )
        }
        await Promise.all(lookups)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this record. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [recordId, reloadKey])

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      </div>
    )
  }

  if (!record) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <p className="mb-1 text-sm text-slate-500">{recordTypeLabel(record.recordType)}</p>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">{record.summaryText}</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {record.vehicleId && (
          <Field
            label="Vehicle"
            value={
              <button type="button" onClick={() => onOpenVehicle(record.vehicleId as string)} className="underline decoration-slate-300">
                {vehicleFleetId ?? '…'}
              </button>
            }
          />
        )}
        {record.driverId && (
          <Field
            label="Driver"
            value={
              <button type="button" onClick={() => onOpenDriver(record.driverId as string)} className="underline decoration-slate-300">
                {driverName ?? '…'}
              </button>
            }
          />
        )}
        {record.amountMinor !== null && (
          <Field
            label="Amount"
            value={`${record.direction === 'EXPENSE' ? '−' : ''}${formatMinorUnits(record.amountMinor).replace('−', '')}`}
          />
        )}
        <Field label="Applies to" value={record.appliesToDate ?? '—'} />
        <Field label="Entered" value={record.enteredAt.slice(0, 10)} />
        <Field label="Entered by" value={enteredByName ?? '…'} />
      </div>

      {dailyPayment &&
        (currentUserRole === 'OWNER_ADMIN' || currentUserRole === 'FLEET_MANAGER') &&
        dailyPayment.shortfallTreatment === 'ACCEPTED_LOSS' &&
        dailyPayment.shortfallTreatmentOverride === null && (
          <ShortfallReviewPanel dailyPaymentId={dailyPayment.id} onDone={() => setReloadKey((k) => k + 1)} />
        )}

      {dailyPayment?.shortfallTreatmentOverride && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Converted to driver debt on review: {dailyPayment.shortfallTreatmentOverrideReason}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * SPEC: "Owner/Admin or Fleet Manager can convert it to driver debt on
 * review." Only offered when the caller's own record shows an accepted
 * shortfall that hasn't already been reviewed — real, enforced again
 * server-side by public.override_shortfall_treatment.
 */
function ShortfallReviewPanel({ dailyPaymentId, onDone }: { dailyPaymentId: string; onDone: () => void }) {
  const [reviewing, setReviewing] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (reason.trim().length < 3) {
      setError('Say why this is being converted to debt.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await overrideShortfallTreatment(dailyPaymentId, reason.trim())
      onDone()
    } catch {
      setError('Could not convert this shortfall. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!reviewing) {
    return (
      <button
        type="button"
        onClick={() => setReviewing(true)}
        className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50"
      >
        Convert to driver debt
      </button>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
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
          onClick={confirm}
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => {
            setReviewing(false)
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </p>
  )
}
