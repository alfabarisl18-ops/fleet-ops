import { useEffect, useState } from 'react'
import { recordTypeLabel } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { ActivityRecord } from '@/data/activityRecords'
import { fetchActivityRecord } from '@/data/activityRecords'
import { supabase } from '@/lib/supabase'

interface RecordDetailScreenProps {
  recordId: string
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
export function RecordDetailScreen({ recordId, onBack, onOpenVehicle, onOpenDriver }: RecordDetailScreenProps) {
  const [record, setRecord] = useState<ActivityRecord | null>(null)
  const [vehicleFleetId, setVehicleFleetId] = useState<string | null>(null)
  const [driverName, setDriverName] = useState<string | null>(null)
  const [enteredByName, setEnteredByName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchActivityRecord(recordId)
      .then(async (r) => {
        if (cancelled || !r) return
        setRecord(r)

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
  }, [recordId])

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
