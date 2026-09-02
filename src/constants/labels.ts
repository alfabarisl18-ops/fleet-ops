import type { AppRole } from '@/data/auth'
import type { RecordType } from '@/data/activityRecords'
import type { ApprovalStatus, TripStatus, WeightUnit } from '@/data/accounting'
import type { CorrectionStatus } from '@/data/corrections'
import type { AlertType } from '@/data/alerts'
import type { BalanceStatus, DayOutcome, LedgerCategory, OverpaymentReason, ShortfallCause } from '@/data/dailyPayments'
import type { DriverStatus } from '@/data/drivers'
import type { OwnershipTransferStatus, PaymentFrequency } from '@/data/driverPurchaseAgreements'
import type {
  FilterAction,
  MaintenanceHandledBy,
  MaintenanceRecordType,
  MaintenanceStatus,
  PartSource,
  ProblemDescriptor,
  Roadworthiness,
} from '@/data/maintenance'
import type { VehicleStatus, VehicleType } from '@/data/vehicles'
import type {
  AcquisitionCostCategory,
  AcquisitionPaymentType,
  FuelType,
  PurchaseGoalStatus,
  PurchasePriority,
  PurchaseStage,
  TransmissionType,
  VehicleCondition,
} from '@/data/futurePurchases'
import type { DocumentType } from '@/lib/documents'
import type { UserStatus } from '@/data/users'

// Every user-facing status string comes from here, so wording stays
// consistent as more screens are built. See CLAUDE.md "Vocabulary".

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER_ADMIN: 'Owner/Admin',
  FLEET_MANAGER: 'Fleet Manager',
  COLLECTIONS_FINANCE: 'Collections & Finance',
  MAINTENANCE_REPAIRS: 'Maintenance & Repairs',
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DISABLED: 'Disabled',
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
  MAINTENANCE_ORDER_OPENED: 'Maintenance record opened',
  MAINTENANCE_STATUS_CHANGED: 'Maintenance status changed',
  MAINTENANCE_PART_ADDED: 'Part added',
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

// SPEC section 4: record types in this exact order — Problem Reported,
// Regular Service, Repair.
export const MAINTENANCE_RECORD_TYPE_LABELS: Record<MaintenanceRecordType, string> = {
  PROBLEM_REPORTED: 'Problem Reported',
  REGULAR_SERVICE: 'Regular Service',
  REPAIR: 'Repair',
}

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  PROBLEM_REPORTED: 'Problem reported',
  INSPECTION_PENDING: 'Inspection pending',
  REPAIR_AUTHORIZED: 'Repair authorized',
  REPAIR_IN_PROGRESS: 'Repair in progress',
  STILL_GROUNDED: 'Still grounded',
  RETURNED_TO_SERVICE: 'Returned to service',
  ADDITIONAL_PROBLEM_FOUND: 'Additional problem found',
  COMPLETED_AND_VERIFIED: 'Completed and verified',
}

export const MAINTENANCE_HANDLED_BY_LABELS: Record<MaintenanceHandledBy, string> = {
  FAMILY_WORKSHOP: 'Family workshop',
  APPROVED_MECHANIC: 'Approved mechanic',
  PARK_MECHANIC: 'Park mechanic',
  OTHER: 'Other',
}

export const PART_SOURCE_LABELS: Record<PartSource, string> = {
  NONE: 'No part used',
  NEW: 'New',
  USED: 'Used',
  EXISTING_REPAIRED: 'Existing, repaired',
}

export const FILTER_ACTION_LABELS: Record<FilterAction, string> = {
  NEW_FILTER: 'New filter installed',
  REUSED: 'Filter reused',
  NOT_CHANGED: 'Filter not changed',
}

export const ROADWORTHINESS_LABELS: Record<Roadworthiness, string> = {
  ROADWORTHY: 'Roadworthy',
  LIMITED_USE: 'Limited use',
  NOT_ROADWORTHY: 'Not roadworthy',
  UNKNOWN: 'Unknown',
}

// SPEC section 7 names all 21 alert types; only 5 have generation logic
// yet (Phase 7 — see the migration). The rest belong to Accounting
// (Phase 8) and Future Purchases (Phase 10) and get labels now so this
// stays exhaustive, the same way every other full-enum label map here
// does, even though nothing raises them yet.
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  MAINTENANCE_DUE: 'Maintenance due',
  MAINTENANCE_OVERDUE: 'Maintenance overdue',
  VEHICLE_GROUNDED: 'Vehicle grounded',
  BALANCE_OUTSTANDING: 'Balance outstanding',
  MISSED_PAYMENT: 'Missed payment',
  UNUSUAL_EXPENSE: 'Unusual expense',
  DISPUTED_EXPENSE: 'Disputed expense',
  RECONCILIATION_DIFFERENCE: 'Reconciliation difference',
  VEHICLE_BELOW_TARGET: 'Vehicle below target',
  SAVINGS_BEHIND: 'Savings behind',
  PURCHASE_DATE_WITHOUT_FUNDS: 'Purchase date approaching without funds',
  DEPOSIT_OR_INSTALLMENT_DUE: 'Deposit or installment due',
  SHIPPING_DEPARTURE: 'Shipping departure',
  EXPECTED_PORT_ARRIVAL: 'Expected port arrival',
  ARRIVAL_DELAY: 'Arrival delay',
  CUSTOMS_DEADLINE: 'Customs deadline',
  DEMURRAGE_RISK: 'Demurrage risk',
  REGISTRATION_DUE: 'Registration due',
  INSURANCE_DUE: 'Insurance due',
  MISSING_DOCUMENTS: 'Missing documents',
  VEHICLE_READY_FOR_ONBOARDING: 'Vehicle ready for onboarding',
  CORRECTION_REQUESTED: 'Correction requested',
}

/**
 * Labels for the raw snake_case keys a correction's before_json/after_json
 * carry — CorrectionPanel uses this to show what actually changed, not
 * just the requester's typed reason. Vehicle's 11 correctable fields
 * (RequestVehicleCorrectionForm) and driver's 13 (RequestDriverCorrectionForm)
 * share no key names, so one map covers both screens' CorrectionPanel
 * instances.
 */
export const CORRECTION_FIELD_LABELS: Record<string, string> = {
  // Vehicle
  fleet_id: 'Fleet ID',
  plate: 'Plate',
  color: 'Color',
  distinguishing_marks: 'Distinguishing marks',
  vin: 'VIN',
  engine_number: 'Engine number',
  cubic_capacity_cc: 'Cubic capacity (cc)',
  seat_count: 'Seats (excl. driver)',
  registration_category: 'Registration category',
  custom_type: 'Type description',
  custom_description: 'Description',
  route_id: 'Route',
  purchased_on: 'Purchased on',
  purchase_price_minor: 'Purchase price',
  entered_service_on: 'Entered service on',
  expected_retirement_on: 'Expected retirement',
  // Driver
  full_name: 'Full name',
  known_as: 'Known as',
  phone: 'Phone',
  phone_alt: 'Alternate phone',
  address: 'Address',
  next_of_kin_name: 'Next of kin name',
  next_of_kin_phone: 'Next of kin phone',
  id_document_type: 'ID document type',
  id_document_number: 'ID document number',
  licence_number: 'Licence number',
  licence_expiry: 'Licence expiry',
  started_on: 'Started on',
  notes: 'Notes',
}

export const PROBLEM_DESCRIPTOR_LABELS: Record<ProblemDescriptor, string> = {
  NOT_WORKING: 'Not working',
  WORN: 'Worn',
  DAMAGED: 'Damaged',
  MAKING_NOISE: 'Making noise',
  LEAKING: 'Leaking',
  WEAK_PERFORMANCE: 'Weak performance',
  NEEDS_INSPECTION: 'Needs inspection',
  NEEDS_REPLACEMENT: 'Needs replacement',
  INTERMITTENT_PROBLEM: 'Intermittent problem',
  OTHER: 'Other',
}

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  LB: 'lb',
  KG: 'kg',
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  NOT_REQUIRED: 'Not required',
  PENDING: 'Unusual — pending review',
  APPROVED: 'Approved',
  DISPUTED: 'Disputed',
}

// --- Future Purchases (Phase 10) --------------------------------------------

export const PURCHASE_PRIORITY_LABELS: Record<PurchasePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

export const PURCHASE_GOAL_STATUS_LABELS: Record<PurchaseGoalStatus, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  ACHIEVED: 'Achieved',
  CANCELLED: 'Cancelled',
}

/** SPEC's own stage list, verbatim. */
export const PURCHASE_STAGE_LABELS: Record<PurchaseStage, string> = {
  IDEA_CONSIDERING: 'Idea/considering',
  RESEARCHING: 'Researching',
  SAVING: 'Saving',
  READY_TO_PURCHASE: 'Ready to purchase',
  SELLER_SELECTED: 'Seller selected',
  DEPOSIT_PAID: 'Deposit paid',
  FULLY_PURCHASED: 'Fully purchased',
  AWAITING_SHIPMENT: 'Awaiting shipment',
  IN_TRANSIT: 'In transit',
  ARRIVED_AT_PORT: 'Arrived at port',
  CUSTOMS_CLEARING: 'Customs/clearing',
  TRANSPORTING_FROM_PORT: 'Transporting from port',
  INSPECTION_AND_REGISTRATION: 'Inspection and registration',
  READY_FOR_ONBOARDING: 'Ready for onboarding',
  ACTIVE_IN_SERVICE: 'Active/in service',
  CANCELLED: 'Cancelled',
}

export const ACQUISITION_PAYMENT_TYPE_LABELS: Record<AcquisitionPaymentType, string> = {
  DEPOSIT: 'Deposit',
  INSTALLMENT: 'Installment',
  FINAL: 'Final payment',
}

export const ACQUISITION_COST_CATEGORY_LABELS: Record<AcquisitionCostCategory, string> = {
  VEHICLE_PRICE: 'Vehicle price',
  PRE_PURCHASE_INSPECTION: 'Pre-purchase inspection',
  AUCTION_FEES: 'Auction fees',
  SELLER_OR_AGENT_FEES: 'Seller or agent fees',
  INLAND_TRANSPORT_TO_PORT: 'Inland transport to port',
  EXPORT_DOCUMENTATION: 'Export documentation',
  SHIPPING: 'Shipping',
  MARINE_INSURANCE: 'Marine insurance',
  PORT_AND_TERMINAL_CHARGES: 'Port and terminal charges',
  CUSTOMS_DUTIES: 'Customs duties',
  CLEARING_AGENT_FEES: 'Clearing-agent fees',
  STORAGE_OR_DEMURRAGE: 'Storage or demurrage',
  TRANSPORT_FROM_PORT: 'Transport from port',
  REGISTRATION: 'Registration',
  PLATES: 'Plates',
  ROADWORTHINESS_INSPECTION: 'Roadworthiness inspection',
  INSURANCE: 'Insurance',
  INITIAL_REPAIRS: 'Initial repairs',
  SPARE_PARTS: 'Spare parts',
  TYRES: 'Tyres',
  BATTERY: 'Battery',
  OIL_AND_FLUIDS: 'Oil and fluids',
  BRANDING_OR_PAINTING: 'Branding or painting',
  GPS_EQUIPMENT: 'GPS equipment',
  OTHER: 'Other',
  CONTINGENCY: 'Contingency',
}

export const VEHICLE_CONDITION_LABELS: Record<VehicleCondition, string> = {
  NEW: 'New',
  USED: 'Used',
}

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  HYBRID: 'Hybrid',
  ELECTRIC: 'Electric',
  OTHER: 'Other',
}

export const TRANSMISSION_TYPE_LABELS: Record<TransmissionType, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automatic',
  OTHER: 'Other',
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  VEHICLE_PHOTO: 'Vehicle photo',
  DRIVER_PHOTO: 'Driver photo',
  DRIVER_ID: 'Driver ID',
  DRIVER_LICENCE: 'Driver licence',
  PURCHASE_AGREEMENT: 'Purchase agreement',
  BILL_OF_LADING: 'Bill of lading',
  RECEIPT: 'Receipt',
  REGISTRATION: 'Registration',
  INSURANCE: 'Insurance',
  ROADWORTHINESS_CERTIFICATE: 'Roadworthiness certificate',
  EXPORT_DOCUMENT: 'Export document',
  CUSTOMS_DOCUMENT: 'Customs document',
  OTHER: 'Other',
}
