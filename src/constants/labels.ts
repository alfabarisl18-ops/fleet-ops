import type { AppRole } from '@/data/auth'
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
