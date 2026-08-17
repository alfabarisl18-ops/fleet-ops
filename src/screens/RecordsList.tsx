import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { recordTypeLabel } from '@/constants/labels'
import type { ActivityRecord } from '@/data/activityRecords'
import { fetchActivityRecords } from '@/data/activityRecords'

interface RecordsListProps {
  onOpenRecord: (recordId: string) => void
}

/**
 * SPEC section 4's Records page lists filters for payments, maintenance,
 * trips, and purchases — none of which exist yet (Phase 5/6). Filtering by
 * whatever record types actually appear in the data, rather than SPEC's
 * full list, keeps every filter option real and clickable, per SPEC's own
 * "every card that looks actionable must work."
 */
export function RecordsList({ onOpenRecord }: RecordsListProps) {
  const [records, setRecords] = useState<ActivityRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    let cancelled = false
    fetchActivityRecords()
      .then((r) => {
        if (!cancelled) setRecords(r)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load records. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const typesPresent = useMemo(() => {
    if (!records) return []
    return [...new Set(records.map((r) => r.recordType))].sort()
  }, [records])

  const filtered = useMemo(() => {
    if (!records) return []
    if (filter === 'ALL') return records
    return records.filter((r) => r.recordType === filter)
  }, [records, filter])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <IconChip section="records" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Records</h1>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {records === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {records?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No activity yet.
        </p>
      )}

      {typesPresent.length > 0 && (
        <label className="mb-4 flex flex-col gap-1 sm:w-64">
          <span className="text-sm font-medium text-slate-700">Filter</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">All activity</option>
            {typesPresent.map((t) => (
              <option key={t} value={t}>
                {recordTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      )}

      <ul className="flex flex-col gap-2">
        {filtered.map((record) => (
          <li key={record.id}>
            <Card onClick={() => onOpenRecord(record.id)} className="flex w-full items-center justify-between">
              <span>
                <span className="block font-medium text-slate-900">{record.summaryText}</span>
                <span className="block text-sm text-slate-500">{recordTypeLabel(record.recordType)}</span>
              </span>
              <span className="text-sm text-slate-500">{record.appliesToDate ?? record.enteredAt.slice(0, 10)}</span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
