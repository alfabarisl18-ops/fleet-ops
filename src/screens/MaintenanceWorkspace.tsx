import { useEffect, useState } from 'react'
import { PendingSyncBadge } from '@/components/PendingSyncBadge'
import { MAINTENANCE_RECORD_TYPE_LABELS, MAINTENANCE_STATUS_LABELS } from '@/constants/labels'
import type { SignedInUser } from '@/data/auth'
import type { MaintenanceOrderListItem } from '@/data/maintenance'
import { fetchMaintenanceOrders } from '@/data/maintenance'
import { AddMaintenanceOrderForm } from '@/screens/AddMaintenanceOrderForm'
import { MaintenanceOrderDetailScreen } from '@/screens/MaintenanceOrderDetailScreen'
import { VehicleStatusScreen } from '@/screens/VehicleStatusScreen'

type MaintenanceView =
  | { name: 'home' }
  | { name: 'add-order' }
  | { name: 'open-orders' }
  | { name: 'order-detail'; orderId: string }
  | { name: 'vehicle-status' }

interface MaintenanceWorkspaceProps {
  user: SignedInUser
  onSignedOut: () => void
}

/**
 * Maintenance & Repairs' workspace, replacing the dead-end SignedIn screen
 * the same way CollectionsWorkspace replaced it for Collections & Finance.
 * SPEC section 6: "Simple, mobile-friendly, no alerts bell, no dashboard...
 * Only maintenance, problems, repairs, parts and vehicle-status tools are
 * visible." Three entry points, matching the Phase 6 plan.
 */
export function MaintenanceWorkspace({ user, onSignedOut }: MaintenanceWorkspaceProps) {
  const [view, setView] = useState<MaintenanceView>({ name: 'home' })
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)

  function goHomeQueued(message: string) {
    setQueuedMessage(message)
    setView({ name: 'home' })
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        {view.name === 'home' ? (
          <span className="text-base font-semibold text-slate-900">Fleet Operations</span>
        ) : (
          <button type="button" onClick={() => setView({ name: 'home' })} className="text-sm text-slate-500">
            ← Back
          </button>
        )}
        <div className="flex items-center gap-2">
          <PendingSyncBadge />
          <button type="button" onClick={onSignedOut} className="text-sm font-medium text-slate-700">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1">
        {view.name === 'home' && (
          <div className="mx-auto flex max-w-sm flex-col gap-4 p-4 sm:p-6">
            {queuedMessage && (
              <p role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {queuedMessage}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setQueuedMessage(null)
                setView({ name: 'add-order' })
              }}
              className="rounded-2xl bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
            >
              <span className="block text-lg font-semibold text-slate-900">New maintenance record</span>
              <span className="mt-1 block text-sm text-slate-500">A problem, a regular service, or a repair</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQueuedMessage(null)
                setView({ name: 'open-orders' })
              }}
              className="rounded-2xl bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
            >
              <span className="block text-lg font-semibold text-slate-900">Open records</span>
              <span className="mt-1 block text-sm text-slate-500">Add a status update, a part, or a note</span>
            </button>

            <button
              type="button"
              onClick={() => setView({ name: 'vehicle-status' })}
              className="rounded-2xl bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
            >
              <span className="block text-lg font-semibold text-slate-900">Vehicle status</span>
              <span className="mt-1 block text-sm text-slate-500">Change whether a vehicle is active or grounded</span>
            </button>
          </div>
        )}

        {view.name === 'add-order' && (
          <AddMaintenanceOrderForm
            currentUserId={user.id}
            onCreated={(orderId) => setView({ name: 'order-detail', orderId })}
            onQueued={() => goHomeQueued('Saved — will sync when back online.')}
            onCancel={() => setView({ name: 'home' })}
          />
        )}

        {view.name === 'open-orders' && <OpenOrdersList onOpenOrder={(orderId) => setView({ name: 'order-detail', orderId })} />}

        {view.name === 'order-detail' && (
          <MaintenanceOrderDetailScreen
            orderId={view.orderId}
            currentUserId={user.id}
            currentUserRole={user.role}
            onBack={() => setView({ name: 'open-orders' })}
          />
        )}

        {view.name === 'vehicle-status' && <VehicleStatusScreen currentUserId={user.id} onDone={() => setView({ name: 'home' })} />}
      </div>
    </div>
  )
}

function OpenOrdersList({ onOpenOrder }: { onOpenOrder: (orderId: string) => void }) {
  const [orders, setOrders] = useState<MaintenanceOrderListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMaintenanceOrders({ openOnly: true })
      .then((o) => {
        if (!cancelled) setOrders(o)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load open records. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-sm p-4 sm:p-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Open records</h1>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {orders === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {orders?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No open records right now.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {orders?.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onOpenOrder(order.id)}
              className="w-full rounded-2xl bg-white px-4 py-4 text-left shadow-sm active:bg-slate-50"
            >
              <span className="block text-base font-medium text-slate-900">
                {order.vehicleFleetId}
                <span className="ml-2 font-normal text-slate-500">
                  {order.serviceArea === 'OIL_CHANGE' ? 'Oil Change' : order.serviceArea}
                </span>
              </span>
              <span className="block text-sm text-slate-500">
                {MAINTENANCE_RECORD_TYPE_LABELS[order.recordType]} · {MAINTENANCE_STATUS_LABELS[order.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
