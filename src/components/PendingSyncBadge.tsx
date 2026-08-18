import { useEffect, useState } from 'react'
import type { QueuedWrite } from '@/lib/offlineQueue'
import { discardQueuedWrite, fetchPendingCount, fetchPendingWrites, subscribeToQueueChanges } from '@/lib/offlineQueue'
import { flushOfflineQueue } from '@/lib/offlineQueueReplay'

const KIND_LABELS: Record<QueuedWrite['kind'], string> = {
  recordDailyPayment: 'Vehicle payment',
  recordBundledPayment: 'Bundled payment',
  recordTrip: 'Trip',
  recordOtherPayment: 'Other payment',
  createMaintenanceOrder: 'Maintenance record',
  changeMaintenanceStatus: 'Status update',
  recordMaintenancePart: 'Part',
  addMaintenanceNote: 'Note',
  changeVehicleStatus: 'Vehicle status',
}

/**
 * The mobile analog of AlertsBell (desktop, TopBar) — SPEC
 * section 8: "The device shows what is still pending sync." Rendered
 * in both CollectionsWorkspace and MaintenanceWorkspace headers.
 */
export function PendingSyncBadge() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<QueuedWrite[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      fetchPendingCount().then((c) => {
        if (!cancelled) setCount(c)
      })
    }
    refresh()
    const unsubscribe = subscribeToQueueChanges(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const refresh = () => {
      fetchPendingWrites().then((rows) => {
        if (!cancelled) setItems(rows)
      })
    }
    refresh()
    const unsubscribe = subscribeToQueueChanges(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [open])

  if (count === 0 && !open) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `${count} pending sync` : 'Pending sync'}
        className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
        {count} pending
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close pending sync" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 z-20 mt-2 w-72 max-w-[90vw] rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
            <div className="mb-1 flex items-center justify-between px-2 py-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending sync</p>
              <button type="button" onClick={() => flushOfflineQueue()} className="text-xs font-medium text-slate-700">
                Retry now
              </button>
            </div>

            {items === null && <p className="px-2 py-2 text-sm text-slate-500">Loading…</p>}
            {items?.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">Nothing pending.</p>}

            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {items?.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-2 rounded-xl px-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{KIND_LABELS[item.kind]}</span>
                    <span className="block text-xs text-slate-500">
                      {item.status === 'failed' ? 'Could not save — ' : item.status === 'syncing' ? 'Syncing…' : 'Waiting to sync'}
                      {item.status === 'failed' && item.lastError ? item.lastError : ''}
                    </span>
                  </span>
                  {item.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => item.id !== undefined && discardQueuedWrite(item.id)}
                      className="shrink-0 text-xs font-medium text-red-600"
                    >
                      Discard
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
