import { useEffect, useState } from 'react'
import { ALERT_TYPE_LABELS } from '@/constants/labels'
import { supabase } from '@/lib/supabase'
import type { AlertListItem, AlertSeverity } from '@/data/alerts'
import { fetchOpenAlertCount, fetchOpenAlerts, reviewAlert } from '@/data/alerts'

interface AlertsBellProps {
  currentUserId: string
  onOpenAlert: (alert: AlertListItem) => void
}

// Colour is never the only channel (CLAUDE.md / accessibility rule) — each
// dot pairs with the alert's own type label, same pattern as VehicleList's
// STATUS_DOT_CLASS. SPEC: "Yellow for new. Red for overdue or urgent."
const SEVERITY_DOT_CLASS: Record<AlertSeverity, string> = {
  NORMAL: 'bg-amber-500',
  OVERDUE: 'bg-red-500',
}

/**
 * Desktop-only — rendered from TopBar, which neither mobile
 * workspace uses (SPEC: "no alerts bell in either mobile workspace").
 * Tapping an alert both marks it reviewed and opens the exact record in
 * one action — immediate badge feedback, no separate mark-read step.
 */
export function AlertsBell({ currentUserId, onOpenAlert }: AlertsBellProps) {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null)
  const [vehicleLabels, setVehicleLabels] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchOpenAlertCount()
      .then((c) => {
        if (!cancelled) setCount(c)
      })
      .catch(() => {
        /* Badge just won't show a count; the bell itself still opens. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchOpenAlerts()
      .then(async (list) => {
        if (cancelled) return
        setAlerts(list)
        setError(null)

        const vehicleIds = [...new Set(list.map((a) => a.vehicleId).filter((id): id is string => id !== null))]
        if (vehicleIds.length > 0) {
          const { data } = await supabase.from('vehicles').select('id, fleet_id').in('id', vehicleIds)
          if (!cancelled && data) {
            setVehicleLabels(Object.fromEntries(data.map((v) => [v.id, v.fleet_id])))
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load alerts. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleOpenAlert(alert: AlertListItem) {
    setOpen(false)
    if (!alert.reviewedAt) {
      setCount((c) => Math.max(0, c - 1))
      reviewAlert(alert.id, currentUserId).catch(() => {
        /* The record still opens even if marking it reviewed fails. */
      })
    }
    onOpenAlert(alert)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `Alerts, ${count} new` : 'Alerts'}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
      >
        <BellIcon lit={count > 0} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close alerts"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Alerts</p>

            {error && (
              <p role="alert" className="px-2 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            {alerts === null && !error && <p className="px-2 py-2 text-sm text-slate-500">Loading…</p>}

            {alerts?.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">No open alerts.</p>}

            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {alerts?.map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => handleOpenAlert(alert)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left active:bg-slate-50"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT_CLASS[alert.severity]}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {ALERT_TYPE_LABELS[alert.type]}
                        {alert.vehicleId && vehicleLabels[alert.vehicleId] ? ` — ${vehicleLabels[alert.vehicleId]}` : ''}
                      </span>
                      <span className="block text-xs text-slate-500">
                        <span className="font-medium text-slate-700">New · </span>
                        {alert.dueOn ?? alert.createdAt.slice(0, 10)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function BellIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M6 8a6 6 0 0 1 12 0c0 3.5 1 5.5 1.5 6.5.3.5-.1 1.5-.9 1.5H5.4c-.8 0-1.2-1-.9-1.5C5 13.5 6 11.5 6 8Z"
        fill={lit ? 'currentColor' : 'none'}
        fillOpacity={lit ? 0.12 : 0}
      />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
    </svg>
  )
}
