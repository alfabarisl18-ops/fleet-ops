import { useState } from 'react'
import { PendingSyncBadge } from '@/components/PendingSyncBadge'
import type { SignedInUser } from '@/data/auth'
import { OtherPaymentForm } from '@/screens/OtherPaymentForm'
import { VehiclePaymentScreen } from '@/screens/VehiclePaymentScreen'

type CollectionsView = { name: 'home' } | { name: 'vehicle-payment' } | { name: 'other-payment' }

interface CollectionsWorkspaceProps {
  user: SignedInUser
  onSignedOut: () => void
}

/**
 * Collections & Finance's workspace, replacing the dead-end SignedIn
 * screen the same way DesktopWorkspace replaced it for desktop roles.
 * SPEC section 5: "Large touch controls. Simple. A data-entry tool, not a
 * dashboard. No alerts bell." Two entry points, matching SPEC's two
 * subsections — "Vehicle Payment" covers both Sprinter and box-truck
 * trip entry now (Phase 8; box trucks route to the trip form from
 * within the vehicle picker).
 */
export function CollectionsWorkspace({ user, onSignedOut }: CollectionsWorkspaceProps) {
  const [view, setView] = useState<CollectionsView>({ name: 'home' })

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
            <button
              type="button"
              onClick={() => setView({ name: 'vehicle-payment' })}
              className="rounded-2xl bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
            >
              <span className="block text-lg font-semibold text-slate-900">Vehicle Payment</span>
              <span className="mt-1 block text-sm text-slate-500">Record what a vehicle brought in today</span>
            </button>

            <button
              type="button"
              onClick={() => setView({ name: 'other-payment' })}
              className="rounded-2xl bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
            >
              <span className="block text-lg font-semibold text-slate-900">Other Payment</span>
              <span className="mt-1 block text-sm text-slate-500">Income or an expense not tied to a vehicle's day</span>
            </button>
          </div>
        )}

        {view.name === 'vehicle-payment' && <VehiclePaymentScreen onDone={() => setView({ name: 'home' })} />}

        {view.name === 'other-payment' && (
          <OtherPaymentForm currentUserId={user.id} onDone={() => setView({ name: 'home' })} />
        )}
      </div>
    </div>
  )
}
