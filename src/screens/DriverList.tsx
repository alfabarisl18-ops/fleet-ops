import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { DRIVER_STATUS_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { DriverListItem, DriverMoneySummary } from '@/data/drivers'
import { fetchDriverMoneySummary, fetchDrivers, summarizeDrivers } from '@/data/drivers'

interface DriverListProps {
  onOpenDriver: (driverId: string) => void
  onAddDriver: () => void
}

export function DriverList({ onOpenDriver, onAddDriver }: DriverListProps) {
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null)
  const [money, setMoney] = useState<DriverMoneySummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchDrivers(), fetchDriverMoneySummary()])
      .then(([d, m]) => {
        if (cancelled) return
        setDrivers(d)
        setMoney(m)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load drivers. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const summary = drivers ? summarizeDrivers(drivers) : null

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconChip section="drivers" />
          <h1 className="font-heading text-xl font-bold text-slate-900">Drivers</h1>
        </div>
        <button
          type="button"
          onClick={onAddDriver}
          className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white active:bg-primary-700"
        >
          + Add Driver
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {summary && money && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Active drivers" value={String(summary.active)} />
          <SummaryCard label="Former drivers" value={String(summary.former)} />
          <SummaryCard label="Total owed by drivers" value={formatMinorUnits(money.totalOwedMinor)} />
          <SummaryCard label="Overdue balances" value={String(money.overdueCount)} />
        </div>
      )}

      {drivers === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {drivers?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No drivers yet. Add the first one to get started.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {drivers?.map((driver) => (
          <li key={driver.id}>
            <Card onClick={() => onOpenDriver(driver.id)} className="flex w-full items-center justify-between">
              <span>
                <span className="block font-medium text-slate-900">{driver.fullName}</span>
                {driver.knownAs && <span className="block text-sm text-slate-500">{driver.knownAs}</span>}
              </span>
              <span className="text-sm text-slate-600">{DRIVER_STATUS_LABELS[driver.status]}</span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
