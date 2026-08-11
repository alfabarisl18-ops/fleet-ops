import type { AppRole } from '@/data/auth'
import type { RecordType } from '@/data/activityRecords'
import type { CorrectionStatus } from '@/data/corrections'
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
