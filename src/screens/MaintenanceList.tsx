import { useEffect, useState } from 'react'
import { MAINTENANCE_RECORD_TYPE_LABELS, MAINTENANCE_STATUS_LABELS } from '@/constants/labels'
import { formatMinorUnits } from '@/lib/money'
import type { MaintenanceOrderListItem, MaintenanceSummary } from '@/data/maintenance'
import { fetchMaintenanceOrders, fetchMaintenanceSummary } from '@/data/maintenance'

interface MaintenanceListProps {
  onOpenOrder: (orderId: string) => void
  onAddOrder: () => void
}

/**
 * SPEC section 4's desktop Maintenance dashboard: Total Records, Vehicles
 * Grounded, Recorded Cost, Old Parts Not Returned. Recorded Cost is a
 * simple total here, not the full analytics breakdown SPEC describes as
 * "linked to Accounting" — deferred to Phase 8 (see the Phase 6 plan).
 */
export function MaintenanceList({ onOpenOrder, onAddOrder }: MaintenanceListProps) {
  const [orders, setOrders] = useState<MaintenanceOrderListItem[] | null>(null)
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchMaintenanceOrders(), fetchMaintenanceSummary()])
      .then(([o, s]) => {
        if (cancelled) return
        setOrders(o)
        setSummary(s)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load maintenance records. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Maintenance</h1>
        <button
          type="button"
          onClick={onAddOrder}
          className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white active:bg-slate-800"
        >
          + New maintenance record
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Records" value={String(summary.totalRecords)} />
          <SummaryCard label="Vehicles Grounded" value={String(summary.vehiclesGrounded)} />
          <SummaryCard label="Recorded Cost" value={formatMinorUnits(summary.recordedCostMinor)} />
          <SummaryCard label="Old Parts Not Returned" value={String(summary.oldPartsNotReturned)} />
        </div>
      )}

      {orders === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {orders?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No maintenance records yet.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {orders?.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onOpenOrder(order.id)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
            >
              <span>
                <span className="block font-medium text-slate-900">
                  {order.vehicleFleetId}
                  <span className="ml-2 font-normal text-slate-500">
                    {order.serviceArea === 'OIL_CHANGE' ? 'Oil Change' : order.serviceArea}
                  </span>
                </span>
                <span className="block text-sm text-slate-500">
                  {MAINTENANCE_RECORD_TYPE_LABELS[order.recordType]} · {order.identifiedOn}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm text-slate-600">
                {order.isGrounded && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-500" />}
                {MAINTENANCE_STATUS_LABELS[order.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
