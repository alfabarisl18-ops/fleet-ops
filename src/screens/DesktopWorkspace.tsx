import { useState } from 'react'
import { DesktopShell } from '@/components/DesktopShell'
import type { NavTarget } from '@/components/Sidebar'
import type { SectionKey } from '@/components/IconChip'
import type { AlertListItem } from '@/data/alerts'
import type { SignedInUser } from '@/data/auth'
import { fetchTransitRecordPlannedVehicleId } from '@/data/futurePurchases'
import { AccountingHome } from '@/screens/AccountingHome'
import { AddDriverForm } from '@/screens/AddDriverForm'
import { AddMaintenanceOrderForm } from '@/screens/AddMaintenanceOrderForm'
import { AddPersonForm } from '@/screens/AddPersonForm'
import { AddPurchaseGoalForm } from '@/screens/AddPurchaseGoalForm'
import { AddVehicleForm } from '@/screens/AddVehicleForm'
import { ApprovalsList } from '@/screens/ApprovalsList'
import { DesktopHome } from '@/screens/DesktopHome'
import { DriverList } from '@/screens/DriverList'
import { DriverProfileScreen } from '@/screens/DriverProfileScreen'
import { ExportReportScreen } from '@/screens/ExportReportScreen'
import { FlaggedDuplicatesList } from '@/screens/FlaggedDuplicatesList'
import type { PlannedVehicleFilter } from '@/screens/FuturePurchasesHome'
import { FuturePurchasesHome } from '@/screens/FuturePurchasesHome'
import { KnownExpensesScreen } from '@/screens/KnownExpensesScreen'
import { MaintenanceList } from '@/screens/MaintenanceList'
import { MaintenanceOrderDetailScreen } from '@/screens/MaintenanceOrderDetailScreen'
import { OnboardVehicleForm } from '@/screens/OnboardVehicleForm'
import { OverduePurchaseActionsList } from '@/screens/OverduePurchaseActionsList'
import { PeopleList } from '@/screens/PeopleList'
import { PlannedVehicleDetailScreen } from '@/screens/PlannedVehicleDetailScreen'
import { PlannedVehicleList } from '@/screens/PlannedVehicleList'
import { PurchaseGoalDetailScreen } from '@/screens/PurchaseGoalDetailScreen'
import { PurchaseGoalList } from '@/screens/PurchaseGoalList'
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
  | { name: 'future-purchases-home' }
  | { name: 'purchase-goal-list' }
  | { name: 'add-purchase-goal' }
  | { name: 'purchase-goal-detail'; goalId: string }
  | { name: 'planned-vehicle-list'; filter: PlannedVehicleFilter; title: string }
  | { name: 'planned-vehicle-detail'; plannedVehicleId: string }
  | { name: 'onboard-vehicle'; plannedVehicleId: string; goalName: string }
  | { name: 'overdue-purchase-actions' }
  | { name: 'export-report' }
  | { name: 'people-list' }
  | { name: 'add-person' }

interface DesktopWorkspaceProps {
  user: SignedInUser
  onSignedOut: () => void
}

/**
 * Which sidebar item glows for a given view — pure UI routing, no data or
 * business logic. The `never`-typed default means a future new
 * `DesktopView` variant fails typecheck here instead of silently landing
 * with no active nav highlight.
 */
function sectionForView(view: DesktopView): NavTarget {
  switch (view.name) {
    case 'home':
      return 'home'
    case 'vehicle-list':
    case 'add-vehicle':
    case 'vehicle-profile':
    case 'set-up-driver-purchase-agreement':
      return 'vehicles'
    case 'driver-list':
    case 'add-driver':
    case 'driver-profile':
      return 'drivers'
    case 'records-list':
    case 'record-detail':
      return 'records'
    case 'maintenance-list':
    case 'add-maintenance-order':
    case 'maintenance-order-detail':
      return 'maintenance'
    case 'accounting-home':
    case 'sprinter-income':
    case 'truck-income':
    case 'known-expenses':
    case 'approvals-list':
    case 'flagged-duplicates':
      return 'accounting'
    case 'future-purchases-home':
    case 'purchase-goal-list':
    case 'add-purchase-goal':
    case 'purchase-goal-detail':
    case 'planned-vehicle-list':
    case 'planned-vehicle-detail':
    case 'onboard-vehicle':
    case 'overdue-purchase-actions':
      return 'future-purchases'
    case 'export-report':
      return 'export'
    case 'people-list':
    case 'add-person':
      return 'settings'
    default: {
      const exhaustive: never = view
      return exhaustive
    }
  }
}

/** Where each sidebar click goes — the same view DesktopHome's own
 *  onOpen* callbacks already navigate to. */
const HOME_VIEW_FOR_SECTION: Record<SectionKey, DesktopView> = {
  vehicles: { name: 'vehicle-list' },
  drivers: { name: 'driver-list' },
  records: { name: 'records-list' },
  maintenance: { name: 'maintenance-list' },
  accounting: { name: 'accounting-home' },
  'future-purchases': { name: 'future-purchases-home' },
  export: { name: 'export-report' },
  settings: { name: 'people-list' },
}

/**
 * SPEC's own phrasing for "the exact record" an alert deep-links to —
 * "the specific maintenance order, balance, or purchase goal" — is
 * literally the subject_type mapping here (decision 0012). Async because
 * one case (TRANSIT_RECORD) needs a lookup: the alert's subject is the
 * transit_records row, but the screen it opens is keyed by
 * planned_vehicle_id — see fetchTransitRecordPlannedVehicleId.
 */
async function resolveAlertView(alert: AlertListItem): Promise<DesktopView> {
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
    case 'PURCHASE_GOAL':
      return { name: 'purchase-goal-detail', goalId: alert.subjectId }
    case 'PLANNED_VEHICLE':
      return { name: 'planned-vehicle-detail', plannedVehicleId: alert.subjectId }
    case 'TRANSIT_RECORD': {
      const plannedVehicleId = await fetchTransitRecordPlannedVehicleId(alert.subjectId)
      return plannedVehicleId ? { name: 'planned-vehicle-detail', plannedVehicleId } : { name: 'home' }
    }
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
    <DesktopShell
      user={user}
      active={sectionForView(view)}
      onNavigate={(target) => setView(target === 'home' ? { name: 'home' } : HOME_VIEW_FOR_SECTION[target])}
      onSignOut={onSignedOut}
      onOpenAlert={(alert) => {
        void resolveAlertView(alert).then(setView)
      }}
    >
      <div className="flex-1">
        {view.name === 'home' && (
          <DesktopHome
            onOpenVehicles={() => setView({ name: 'vehicle-list' })}
            onOpenDrivers={() => setView({ name: 'driver-list' })}
            onOpenRecords={() => setView({ name: 'records-list' })}
            onOpenMaintenance={() => setView({ name: 'maintenance-list' })}
            onOpenAccounting={() => setView({ name: 'accounting-home' })}
            onOpenFuturePurchases={() => setView({ name: 'future-purchases-home' })}
            onOpenExport={() => setView({ name: 'export-report' })}
            onOpenSettings={() => setView({ name: 'people-list' })}
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

        {view.name === 'future-purchases-home' && (
          <FuturePurchasesHome
            onOpenGoals={() => setView({ name: 'purchase-goal-list' })}
            onOpenPlannedVehicles={(filter, title) => setView({ name: 'planned-vehicle-list', filter, title })}
            onOpenOverdueActions={() => setView({ name: 'overdue-purchase-actions' })}
          />
        )}

        {view.name === 'purchase-goal-list' && (
          <PurchaseGoalList
            onOpenGoal={(goalId) => setView({ name: 'purchase-goal-detail', goalId })}
            onAddGoal={() => setView({ name: 'add-purchase-goal' })}
          />
        )}

        {view.name === 'add-purchase-goal' && (
          <AddPurchaseGoalForm
            currentUserId={user.id}
            onCreated={(goalId) => setView({ name: 'purchase-goal-detail', goalId })}
            onCancel={() => setView({ name: 'purchase-goal-list' })}
          />
        )}

        {view.name === 'purchase-goal-detail' && (
          <PurchaseGoalDetailScreen
            goalId={view.goalId}
            currentUserId={user.id}
            currentUserRole={user.role}
            onBack={() => setView({ name: 'purchase-goal-list' })}
            onOpenPlannedVehicle={(plannedVehicleId) => setView({ name: 'planned-vehicle-detail', plannedVehicleId })}
          />
        )}

        {view.name === 'planned-vehicle-list' && (
          <PlannedVehicleList
            filter={view.filter}
            title={view.title}
            onBack={() => setView({ name: 'future-purchases-home' })}
            onOpenPlannedVehicle={(plannedVehicleId) => setView({ name: 'planned-vehicle-detail', plannedVehicleId })}
          />
        )}

        {view.name === 'planned-vehicle-detail' && (
          <PlannedVehicleDetailScreen
            plannedVehicleId={view.plannedVehicleId}
            currentUserId={user.id}
            onBack={() => setView({ name: 'future-purchases-home' })}
            onOnboard={(plannedVehicleId, goalName) => setView({ name: 'onboard-vehicle', plannedVehicleId, goalName })}
          />
        )}

        {view.name === 'onboard-vehicle' && (
          <OnboardVehicleForm
            plannedVehicleId={view.plannedVehicleId}
            goalName={view.goalName}
            onOnboarded={(vehicleId) => setView({ name: 'vehicle-profile', vehicleId })}
            onCancel={() => setView({ name: 'planned-vehicle-detail', plannedVehicleId: view.plannedVehicleId })}
          />
        )}

        {view.name === 'overdue-purchase-actions' && (
          <OverduePurchaseActionsList
            currentUserId={user.id}
            onBack={() => setView({ name: 'future-purchases-home' })}
            onOpenAlert={(alert) => {
              void resolveAlertView(alert).then(setView)
            }}
          />
        )}

        {view.name === 'export-report' && <ExportReportScreen onBack={() => setView({ name: 'home' })} />}

        {view.name === 'people-list' && (
          <PeopleList
            currentUserId={user.id}
            currentUserRole={user.role}
            onBack={() => setView({ name: 'home' })}
            onAddPerson={() => setView({ name: 'add-person' })}
          />
        )}

        {view.name === 'add-person' && (
          <AddPersonForm onCreated={() => setView({ name: 'people-list' })} onCancel={() => setView({ name: 'people-list' })} />
        )}
      </div>
    </DesktopShell>
  )
}
