import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import type { SectionKey } from '@/components/IconChip'
import { IconChip, SECTION_LABELS, SECTION_ORDER } from '@/components/IconChip'
import { recordTypeLabel } from '@/constants/labels'
import type { ActivityRecord } from '@/data/activityRecords'
import { fetchActivityRecords } from '@/data/activityRecords'
import type { VehicleListItem, VehicleStatus } from '@/data/vehicles'
import { fetchVehicles, summarizeVehicles } from '@/data/vehicles'

interface DesktopHomeProps {
  onOpenVehicles: () => void
  onOpenDrivers: () => void
  onOpenRecords: () => void
  onOpenMaintenance: () => void
  onOpenAccounting: () => void
  onOpenFuturePurchases: () => void
  onOpenExport: () => void
  onOpenSettings: () => void
}

const SECTION_SUBTITLES: Record<SectionKey, string> = {
  vehicles: 'Fleet list, status, and profiles',
  drivers: 'Everyone who has driven for the business',
  records: 'Every vehicle, driver, and correction event',
  maintenance: 'Problems, repairs, parts, and vehicle status',
  accounting: 'Income, expenses, and the ledger',
  'future-purchases': 'Savings goals, purchases, transit, and onboarding',
  export: 'Download ledger transactions as a CSV',
  settings: 'People, roles, PINs, and permissions',
}

// Same dots VehicleList.tsx already uses — colour is never the only
// channel, each pairs with the status word right next to it.
const STATUS_DOT_CLASS: Record<VehicleStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  GROUNDED: 'bg-red-500',
  IN_MAINTENANCE: 'bg-amber-500',
  ARCHIVED: 'bg-slate-400',
}

/**
 * SPEC section 4's full Home card list, now all built: Vehicles, Drivers,
 * Records, Maintenance, Accounting, Future Purchases, Export report,
 * Settings. (Payment targets and Approvals are folded into the vehicle
 * profile and Accounting respectively — see decision 0013 — rather than
 * getting their own top-level cards.) The sidebar (Stage 2) is now the
 * primary way to reach a section; this page's own job shrank to a real
 * landing view — one live stat, quick links, and a glance at recent
 * activity — not a second copy of the nav.
 *
 * Deliberately no "Good evening" time-of-day greeting: the team is split
 * across Freetown, the US, and China (see CLAUDE.md's business-date
 * rule), so a greeting derived from the viewer's own clock would be
 * wrong for whoever isn't in that timezone right now.
 */
export function DesktopHome({
  onOpenVehicles,
  onOpenDrivers,
  onOpenRecords,
  onOpenMaintenance,
  onOpenAccounting,
  onOpenFuturePurchases,
  onOpenExport,
  onOpenSettings,
}: DesktopHomeProps) {
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null)
  const [records, setRecords] = useState<ActivityRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchVehicles(), fetchActivityRecords()])
      .then(([v, r]) => {
        if (cancelled) return
        setVehicles(v)
        // fetchActivityRecords() is already ordered entered_at desc — this
        // is a slice of an existing sort, not a new one.
        setRecords(r.slice(0, 5))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your fleet. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const onOpenSection: Record<SectionKey, () => void> = {
    vehicles: onOpenVehicles,
    drivers: onOpenDrivers,
    records: onOpenRecords,
    maintenance: onOpenMaintenance,
    accounting: onOpenAccounting,
    'future-purchases': onOpenFuturePurchases,
    export: onOpenExport,
    settings: onOpenSettings,
  }

  const summary = vehicles ? summarizeVehicles(vehicles) : null

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="font-heading text-2xl font-bold text-slate-900">Home</h1>
      <p className="mt-1 text-sm text-slate-500">This is your fleet today.</p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {summary && (
        <Card className="mt-6 inline-flex items-center gap-4 sm:w-64">
          <IconChip section="vehicles" size={44} />
          <div>
            <p className="font-heading text-2xl font-bold text-slate-900">{summary.total}</p>
            <p className="text-sm text-slate-500">Vehicles</p>
          </div>
        </Card>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">What do you want to open?</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTION_ORDER.map((section) => (
          <Card key={section} onClick={onOpenSection[section]}>
            <IconChip section={section} className="mb-3" />
            <span className="font-heading block text-base font-semibold text-slate-900">{SECTION_LABELS[section]}</span>
            <span className="mt-1 block text-sm text-slate-500">{SECTION_SUBTITLES[section]}</span>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Your vehicles</h2>
            <button type="button" onClick={onOpenVehicles} className="text-sm font-medium text-primary-600 underline decoration-primary-200">
              View all
            </button>
          </div>
          {vehicles === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
          {vehicles?.length === 0 && <p className="text-sm text-slate-500">No vehicles yet.</p>}
          <ul className="flex flex-col divide-y divide-slate-100">
            {vehicles?.slice(0, 6).map((v) => (
              <li key={v.id} className="flex items-center gap-2 py-2 text-sm">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[v.status]}`} />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{v.fleetId}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Recent records</h2>
            <button type="button" onClick={onOpenRecords} className="text-sm font-medium text-primary-600 underline decoration-primary-200">
              View all
            </button>
          </div>
          {records === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
          {records?.length === 0 && <p className="text-sm text-slate-500">No records yet.</p>}
          <ul className="flex flex-col divide-y divide-slate-100">
            {records?.map((r) => (
              <li key={r.id} className="py-2">
                <span className="block truncate text-sm font-medium text-slate-900">{r.summaryText}</span>
                <span className="block text-xs text-slate-500">{recordTypeLabel(r.recordType)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
