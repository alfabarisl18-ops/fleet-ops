import { useState } from 'react'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import type { AlertListItem } from '@/data/alerts'
import type { SignedInUser } from '@/data/auth'
import { AccountingHome } from '@/screens/AccountingHome'
import { AddDriverForm } from '@/screens/AddDriverForm'
import { AddMaintenanceOrderForm } from '@/screens/AddMaintenanceOrderForm'
import { AddVehicleForm } from '@/screens/AddVehicleForm'
import { ApprovalsList } from '@/screens/ApprovalsList'
import { DesktopHome } from '@/screens/DesktopHome'
import { DriverList } from '@/screens/DriverList'
import { DriverProfileScreen } from '@/screens/DriverProfileScreen'
import { FlaggedDuplicatesList } from '@/screens/FlaggedDuplicatesList'
import { KnownExpensesScreen } from '@/screens/KnownExpensesScreen'
import { MaintenanceList } from '@/screens/MaintenanceList'
import { MaintenanceOrderDetailScreen } from '@/screens/MaintenanceOrderDetailScreen'
import { RecordDetailScreen } from '@/screens/RecordDetailScreen'
import { RecordsList } from '@/screens/RecordsList'
import { SetUpDriverPurchaseAgreementForm } from '@/screens/SetUpDriverPurchaseAgreementForm'
import { SprinterIncomeScreen } from '@/screens/SprinterIncomeScreen'
import { TruckIncomeScreen } from '@/screens/TruckIncomeScreen'
import { VehicleList } from '@/screens/VehicleList'
import { VehicleProfileScreen } from '@/screens/VehicleProfileScreen'

type DesktopView =
  | { name: 'home' }
  | { name: 'vehicle-list' }
  | { name: 'add-vehicle' }
  | { name: 'vehicle-profile'; vehicleId: string }
  | { name: 'driver-list' }
  | { name: 'add-driver'; assignToVehicleId?: string }
  | { name: 'driver-profile'; driverId: string; highlightBalanceId?: string }
  | { name: 'set-up-driver-purchase-agreement'; vehicleId: string }
  | { name: 'records-list' }
  | { name: 'record-detail'; recordId: string }
  | { name: 'maintenance-list' }
  | { name: 'add-maintenance-order' }
  | { name: 'maintenance-order-detail'; orderId: string }
  | { name: 'accounting-home' }
  | { name: 'sprinter-income' }
  | { name: 'truck-income' }
  | { name: 'known-expenses' }
  | { name: 'approvals-list' }
  | { name: 'flagged-duplicates' }

interface DesktopWorkspaceProps {
  user: SignedInUser
  onSignedOut: () => void
}

/**
 * SPEC's own phrasing for "the exact record" an alert deep-links to —
 * "the specific maintenance order, balance, or purchase goal" — is
 * literally the subject_type mapping here (decision 0012).
 */
function viewForAlert(alert: AlertListItem): DesktopView {
  switch (alert.subjectType) {
    case 'MAINTENANCE_ORDER':
      return { name: 'maintenance-order-detail', orderId: alert.subjectId }
    case 'OUTSTANDING_BALANCE':
      return alert.driverId
        ? { name: 'driver-profile', driverId: alert.driverId, highlightBalanceId: alert.subjectId }
        : { name: 'home' }
    case 'VEHICLE':
      return { name: 'vehicle-profile', vehicleId: alert.subjectId }
    case 'LEDGER_ENTRY':
      return { name: 'approvals-list' }
    default:
      return { name: 'home' }
  }
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
        onOpenAlert={(alert) => setView(viewForAlert(alert))}
      />
      <div className="flex-1">
        {view.name === 'home' && (
          <DesktopHome
            onOpenVehicles={() => setView({ name: 'vehicle-list' })}
            onOpenDrivers={() => setView({ name: 'driver-list' })}
            onOpenRecords={() => setView({ name: 'records-list' })}
            onOpenMaintenance={() => setView({ name: 'maintenance-list' })}
            onOpenAccounting={() => setView({ name: 'accounting-home' })}
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
            currentUserRole={user.role}
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
            currentUserId={user.id}
            currentUserRole={user.role}
            onBack={() => setView({ name: 'driver-list' })}
            onOpenVehicle={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
            {...(view.highlightBalanceId ? { highlightBalanceId: view.highlightBalanceId } : {})}
          />
        )}

        {view.name === 'set-up-driver-purchase-agreement' && (
          <SetUpDriverPurchaseAgreementForm
            vehicleId={view.vehicleId}
            onDone={() => setView({ name: 'vehicle-profile', vehicleId: view.vehicleId })}
            onCancel={() => setView({ name: 'vehicle-profile', vehicleId: view.vehicleId })}
          />
        )}

        {view.name === 'records-list' && <RecordsList onOpenRecord={(recordId) => setView({ name: 'record-detail', recordId })} />}

        {view.name === 'record-detail' && (
          <RecordDetailScreen
            recordId={view.recordId}
            currentUserRole={user.role}
            onBack={() => setView({ name: 'records-list' })}
            onOpenVehicle={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
            onOpenDriver={(driverId) => setView({ name: 'driver-profile', driverId })}
          />
        )}

        {view.name === 'maintenance-list' && (
          <MaintenanceList
            onOpenOrder={(orderId) => setView({ name: 'maintenance-order-detail', orderId })}
            onAddOrder={() => setView({ name: 'add-maintenance-order' })}
          />
        )}

        {view.name === 'add-maintenance-order' && (
          <AddMaintenanceOrderForm
            currentUserId={user.id}
            onCreated={(orderId) => setView({ name: 'maintenance-order-detail', orderId })}
            onQueued={() => setView({ name: 'maintenance-list' })}
            onCancel={() => setView({ name: 'maintenance-list' })}
          />
        )}

        {view.name === 'maintenance-order-detail' && (
          <MaintenanceOrderDetailScreen
            orderId={view.orderId}
            currentUserId={user.id}
            currentUserRole={user.role}
            onBack={() => setView({ name: 'maintenance-list' })}
            onOpenVehicle={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
          />
        )}

        {view.name === 'accounting-home' && (
          <AccountingHome
            onOpenSprinterIncome={() => setView({ name: 'sprinter-income' })}
            onOpenTruckIncome={() => setView({ name: 'truck-income' })}
            onOpenKnownExpenses={() => setView({ name: 'known-expenses' })}
            onOpenApprovals={() => setView({ name: 'approvals-list' })}
            onOpenFlaggedDuplicates={() => setView({ name: 'flagged-duplicates' })}
          />
        )}

        {view.name === 'sprinter-income' && (
          <SprinterIncomeScreen
            onBack={() => setView({ name: 'accounting-home' })}
            onOpenVehicle={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
          />
        )}

        {view.name === 'truck-income' && <TruckIncomeScreen onBack={() => setView({ name: 'accounting-home' })} />}

        {view.name === 'known-expenses' && <KnownExpensesScreen onBack={() => setView({ name: 'accounting-home' })} />}

        {view.name === 'approvals-list' && (
          <ApprovalsList currentUserRole={user.role} onBack={() => setView({ name: 'accounting-home' })} />
        )}

        {view.name === 'flagged-duplicates' && (
          <FlaggedDuplicatesList currentUserId={user.id} onBack={() => setView({ name: 'accounting-home' })} />
        )}
      </div>
    </div>
  )
}
