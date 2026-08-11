import { useState } from 'react'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import type { SignedInUser } from '@/data/auth'
import { AddDriverForm } from '@/screens/AddDriverForm'
import { AddVehicleForm } from '@/screens/AddVehicleForm'
import { DesktopHome } from '@/screens/DesktopHome'
import { DriverList } from '@/screens/DriverList'
import { DriverProfileScreen } from '@/screens/DriverProfileScreen'
import { SetUpDriverPurchaseAgreementForm } from '@/screens/SetUpDriverPurchaseAgreementForm'
import { VehicleList } from '@/screens/VehicleList'
import { VehicleProfileScreen } from '@/screens/VehicleProfileScreen'

type DesktopView =
  | { name: 'home' }
  | { name: 'vehicle-list' }
  | { name: 'add-vehicle' }
  | { name: 'vehicle-profile'; vehicleId: string }
  | { name: 'driver-list' }
  | { name: 'add-driver'; assignToVehicleId?: string }
  | { name: 'driver-profile'; driverId: string }
  | { name: 'set-up-driver-purchase-agreement'; vehicleId: string }

interface DesktopWorkspaceProps {
  user: SignedInUser
  onSignedOut: () => void
}

/**
 * Owns navigation for Owner/Admin and Fleet Manager once signed in. Hand-
 * rolled discriminated-union state, matching the pattern src/App.tsx already
 * uses for the sign-in flow — see the Phase 3 plan's "no router yet" note
 * for why, and when that stops being the right call.
 */
export function DesktopWorkspace({ user, onSignedOut }: DesktopWorkspaceProps) {
  const [view, setView] = useState<DesktopView>({ name: 'home' })

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <WorkspaceHeader
        user={user}
        {...(view.name !== 'home' ? { onHome: () => setView({ name: 'home' }) } : {})}
        onSignOut={onSignedOut}
      />
      <div className="flex-1">
        {view.name === 'home' && (
          <DesktopHome
            onOpenVehicles={() => setView({ name: 'vehicle-list' })}
            onOpenDrivers={() => setView({ name: 'driver-list' })}
          />
        )}

        {view.name === 'vehicle-list' && (
          <VehicleList
            onOpenVehicle={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
            onAddVehicle={() => setView({ name: 'add-vehicle' })}
          />
        )}

        {view.name === 'add-vehicle' && (
          <AddVehicleForm
            onCreated={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
            onCancel={() => setView({ name: 'vehicle-list' })}
          />
        )}

        {view.name === 'vehicle-profile' && (
          <VehicleProfileScreen
            vehicleId={view.vehicleId}
            currentUserId={user.id}
            onBack={() => setView({ name: 'vehicle-list' })}
            onOpenDriver={(driverId) => setView({ name: 'driver-profile', driverId })}
            onAddDriverToAssign={(vehicleId) => setView({ name: 'add-driver', assignToVehicleId: vehicleId })}
            onSetUpAgreement={(vehicleId) => setView({ name: 'set-up-driver-purchase-agreement', vehicleId })}
          />
        )}

        {view.name === 'driver-list' && (
          <DriverList
            onOpenDriver={(driverId) => setView({ name: 'driver-profile', driverId })}
            onAddDriver={() => setView({ name: 'add-driver' })}
          />
        )}

        {view.name === 'add-driver' && (
          <AddDriverForm
            {...(view.assignToVehicleId ? { assignToVehicleId: view.assignToVehicleId } : {})}
            onCreated={(driverId) =>
              setView(
                view.assignToVehicleId
                  ? { name: 'vehicle-profile', vehicleId: view.assignToVehicleId }
                  : { name: 'driver-profile', driverId },
              )
            }
            onCancel={() =>
              setView(view.assignToVehicleId ? { name: 'vehicle-profile', vehicleId: view.assignToVehicleId } : { name: 'driver-list' })
            }
          />
        )}

        {view.name === 'driver-profile' && (
          <DriverProfileScreen
            driverId={view.driverId}
            onBack={() => setView({ name: 'driver-list' })}
            onOpenVehicle={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
          />
        )}

        {view.name === 'set-up-driver-purchase-agreement' && (
          <SetUpDriverPurchaseAgreementForm
            vehicleId={view.vehicleId}
            onDone={() => setView({ name: 'vehicle-profile', vehicleId: view.vehicleId })}
            onCancel={() => setView({ name: 'vehicle-profile', vehicleId: view.vehicleId })}
          />
        )}
      </div>
    </div>
  )
}
