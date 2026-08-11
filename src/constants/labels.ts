import type { AppRole } from '@/data/auth'
import type { RecordType } from '@/data/activityRecords'
import type { CorrectionStatus } from '@/data/corrections'
import type { BalanceStatus, DayOutcome, LedgerCategory, OverpaymentReason, ShortfallCause } from '@/data/dailyPayments'
import type { DriverStatus } from '@/data/drivers'
import type { OwnershipTransferStatus, PaymentFrequency } from '@/data/driverPurchaseAgreements'
import type { VehicleStatus, VehicleType } from '@/data/vehicles'

// Every user-facing status string comes from here, so wording stays
// consistent as more screens are built. See CLAUDE.md "Vocabulary".

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER_ADMIN: 'Owner/Admin',
  FLEET_MANAGER: 'Fleet Manager',
  COLLECTIONS_FINANCE: 'Collections & Finance',
  MAINTENANCE_REPAIRS: 'Maintenance & Repairs',
}

// CLAUDE.md: "Vehicle status is Active, Grounded, In maintenance. Never
// Safe, never Running." ARCHIVED is a real status but never offered as a
// destination in the status control — a vehicle is archived by removing it,
// not by picking "Archived" from a list. See VehicleProfileScreen.
export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  ACTIVE: 'Active',
  GROUNDED: 'Grounded',
  IN_MAINTENANCE: 'In maintenance',
  ARCHIVED: 'Archived',
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  LONG_SPRINTER: 'Long Sprinter',
  SHORT_SPRINTER: 'Short Sprinter',
  BOX_TRUCK: 'Box truck',
  BUS: 'Bus',
  GARBAGE_TRUCK: 'Garbage truck',
  TRICYCLE: 'Tricycle',
  OTHER: 'Other',
}

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  FORMER: 'Former',
}

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
}

export const OWNERSHIP_TRANSFER_STATUS_LABELS: Record<OwnershipTransferStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

// activity_records.record_type is plain text (Phase 1's own design — see
// src/data/activityRecords.ts), not a database enum, so this can't be an
// exhaustive Record<> the way the others are. Falls back to the raw value
// for anything not yet in RecordType, rather than a blank label.
export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  VEHICLE_ADDED: 'Vehicle added',
  DRIVER_ADDED: 'Driver added',
  VEHICLE_STATUS_CHANGED: 'Vehicle status changed',
  DRIVER_ASSIGNED: 'Driver assigned',
  DRIVER_PURCHASE_AGREEMENT_CREATED: 'Driver-purchase agreement created',
  DRIVER_DELETED: 'Driver deleted',
  CORRECTION_REQUESTED: 'Correction requested',
  CORRECTION_APPLIED: 'Correction applied',
  CORRECTION_REJECTED: 'Correction rejected',
  DAILY_PAYMENT_RECORDED: 'Vehicle payment recorded',
  BUNDLED_PAYMENT_RECORDED: 'Bundled payment recorded',
  OTHER_PAYMENT_RECORDED: 'Other payment recorded',
  SHORTFALL_OVERRIDDEN_TO_DEBT: 'Shortfall converted to driver debt',
}

export function recordTypeLabel(recordType: RecordType): string {
  return RECORD_TYPE_LABELS[recordType] ?? recordType
}

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  APPLIED: 'Applied',
}

// CLAUDE.md: "Day outcomes are Full Day, Half Day, Driver's Day, Breakdown,
// Did Not Work." Exact wording, never abbreviated.
export const DAY_OUTCOME_LABELS: Record<DayOutcome, string> = {
  FULL_DAY: 'Full Day',
  HALF_DAY: 'Half Day',
  DRIVERS_DAY: "Driver's Day",
  BREAKDOWN: 'Breakdown',
  DID_NOT_WORK: 'Did Not Work',
}

export const SHORTFALL_CAUSE_LABELS: Record<ShortfallCause, string> = {
  BREAKDOWN: 'Breakdown',
  ACCIDENT: 'Accident',
  POLICE_CHECKPOINT: 'Police or checkpoint',
  OTHER: 'Other',
}

export const OVERPAYMENT_REASON_LABELS: Record<OverpaymentReason, string> = {
  SETTLING_BALANCE: 'Settling an earlier shortfall',
  ADVANCE: 'Advance on a future day',
  OTHER: 'Other',
}

export const BALANCE_STATUS_LABELS: Record<BalanceStatus, string> = {
  OPEN: 'Open',
  PARTIAL: 'Partially paid',
  CLEARED: 'Cleared',
  WRITTEN_OFF: 'Written off',
}

export const LEDGER_CATEGORY_LABELS: Record<LedgerCategory, string> = {
  PARTS: 'Parts',
  LABOUR: 'Labour',
  MAINTENANCE: 'Maintenance',
  FUEL: 'Fuel',
  ROAD_CHECKPOINT: 'Road / checkpoint',
  DRIVER_OR_HELPER_PAYMENT: 'Driver or helper payment',
  VEHICLE_PURCHASE: 'Vehicle purchase',
  LICENSING_INSURANCE: 'Licensing / insurance',
  OTHER_EXPENSE: 'Other expense',
  DAILY_VEHICLE_PAYMENT: 'Daily vehicle payment',
  TRIP_REVENUE: 'Trip revenue',
  BALANCE_SETTLEMENT: 'Balance settlement',
  DRIVER_PURCHASE_INSTALLMENT: 'Driver-purchase installment',
  OTHER_INCOME: 'Other income',
}

export const EXPENSE_LEDGER_CATEGORIES: LedgerCategory[] = [
  'PARTS',
  'LABOUR',
  'MAINTENANCE',
  'FUEL',
  'ROAD_CHECKPOINT',
  'DRIVER_OR_HELPER_PAYMENT',
  'VEHICLE_PURCHASE',
  'LICENSING_INSURANCE',
  'OTHER_EXPENSE',
]

export const INCOME_LEDGER_CATEGORIES: LedgerCategory[] = [
  'DAILY_VEHICLE_PAYMENT',
  'TRIP_REVENUE',
  'BALANCE_SETTLEMENT',
  'DRIVER_PURCHASE_INSTALLMENT',
  'OTHER_INCOME',
]
