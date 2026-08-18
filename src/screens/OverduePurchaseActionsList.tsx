import { useEffect, useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { ALERT_TYPE_LABELS } from '@/constants/labels'
import type { AlertListItem } from '@/data/alerts'
import { reviewAlert } from '@/data/alerts'
import { fetchOverduePurchaseActions } from '@/data/futurePurchases'

interface OverduePurchaseActionsListProps {
  currentUserId: string
  onBack: () => void
  onOpenAlert: (alert: AlertListItem) => void
}

/** Backs the "Overdue Purchase Actions" card — SPEC: "Cards, all
 *  clickable." Same open/review shape as AlertsBell's own list, just as a
 *  full page rather than a dropdown, and scoped to Future Purchases'
 *  own 12 alert types at OVERDUE severity. */
export function OverduePurchaseActionsList({ currentUserId, onBack, onOpenAlert }: OverduePurchaseActionsListProps) {
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchOverduePurchaseActions()
      .then((a) => {
        if (!cancelled) setAlerts(a)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load overdue actions. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleOpen(alert: AlertListItem) {
    if (!alert.reviewedAt) {
      reviewAlert(alert.id, currentUserId).catch(() => {
        /* The record still opens even if marking it reviewed fails. */
      })
    }
    onOpenAlert(alert)
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-4 flex items-center gap-3">
        <IconChip section="future-purchases" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Overdue purchase actions</h1>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {alerts === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {alerts?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nothing overdue right now.</p>
      )}

      <ul className="flex flex-col gap-2">
        {alerts?.map((alert) => (
          <li key={alert.id}>
            <button
              type="button"
              onClick={() => handleOpen(alert)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
            >
              <span>
                <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="font-medium text-slate-900">{ALERT_TYPE_LABELS[alert.type]}</span>
                {!alert.reviewedAt && <span className="ml-2 text-xs font-medium text-slate-500">New</span>}
              </span>
              <span className="text-sm text-slate-500">{alert.dueOn ?? alert.createdAt.slice(0, 10)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
