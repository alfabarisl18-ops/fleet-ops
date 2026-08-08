-- Fleet Operations SL — Phase 1 foundation
-- 02 · Enum types.
--
-- Every enum here is mirrored as a TypeScript union in src/types/database.ts.
-- Values are SCREAMING_SNAKE_CASE; the words shown to a user live in a single
-- constants file at the render layer, never in the database.

-- --- Identity ---------------------------------------------------------------

create type public.user_role as enum (
  'OWNER_ADMIN',
  'FLEET_MANAGER',
  'COLLECTIONS_FINANCE',
  'MAINTENANCE_REPAIRS'
);

create type public.user_status as enum ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- --- Fleet ------------------------------------------------------------------

create type public.vehicle_type as enum (
  'LONG_SPRINTER',
  'SHORT_SPRINTER',
  'BOX_TRUCK',
  'BUS',
  'GARBAGE_TRUCK',
  'TRICYCLE',
  'OTHER'
);

-- Displayed as Active / Grounded / In maintenance. Never "Safe", never "Running".
create type public.vehicle_status as enum (
  'ACTIVE',
  'GROUNDED',
  'IN_MAINTENANCE',
  'ARCHIVED'
);

create type public.driver_status as enum ('ACTIVE', 'SUSPENDED', 'FORMER');

create type public.payment_frequency as enum ('DAILY', 'WEEKLY', 'MONTHLY');

create type public.ownership_transfer_status as enum (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

-- --- Shared entity reference ------------------------------------------------
-- Used by alerts.subject_type, documents.owner_type, activity_records.target_type,
-- ledger_entries.source_type and corrections.target_table. Structural rule 5:
-- an alert stores a concrete target so tapping it opens the exact record.

create type public.entity_type as enum (
  'USER',
  'VEHICLE',
  'DRIVER',
  'DRIVER_ASSIGNMENT',
  'DRIVER_PURCHASE_AGREEMENT',
  'LEDGER_ENTRY',
  'DAILY_PAYMENT_RECORD',
  'BUNDLED_PAYMENT',
  'OUTSTANDING_BALANCE',
  'BALANCE_SETTLEMENT',
  'DRIVER_CREDIT',
  'TRIP',
  'MAINTENANCE_ORDER',
  'MAINTENANCE_PART',
  'PURCHASE_GOAL',
  'PLANNED_VEHICLE',
  'ACQUISITION_PAYMENT',
  'ACQUISITION_COST_LINE',
  'TRANSIT_RECORD',
  'DOCUMENT'
);

-- --- Money ------------------------------------------------------------------

create type public.ledger_direction as enum ('INCOME', 'EXPENSE');

-- One enum for both directions, with a table CHECK tying each category to a
-- direction. Splitting into two enums would make `category` untypeable.
create type public.ledger_category as enum (
  -- expenses
  'PARTS',
  'LABOUR',
  'MAINTENANCE',
  'FUEL',
  'ROAD_CHECKPOINT',
  'DRIVER_OR_HELPER_PAYMENT',
  'VEHICLE_PURCHASE',
  'LICENSING_INSURANCE',
  'OTHER_EXPENSE',
  -- income
  'DAILY_VEHICLE_PAYMENT',
  'TRIP_REVENUE',
  'BALANCE_SETTLEMENT',
  'DRIVER_PURCHASE_INSTALLMENT',
  'OTHER_INCOME'
);

create type public.approval_status as enum (
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'DISPUTED'
);

create type public.correction_status as enum (
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'APPLIED'
);

-- --- Daily payments ---------------------------------------------------------

create type public.day_outcome as enum (
  'FULL_DAY',
  'HALF_DAY',
  'DRIVERS_DAY',
  'BREAKDOWN',
  'DID_NOT_WORK'
);

create type public.shortfall_treatment as enum ('DRIVER_DEBT', 'ACCEPTED_LOSS');

create type public.shortfall_cause as enum (
  'BREAKDOWN',
  'ACCIDENT',
  'POLICE_CHECKPOINT',
  'OTHER'
);

create type public.overpayment_reason as enum ('SETTLING_BALANCE', 'ADVANCE', 'OTHER');

create type public.balance_status as enum ('OPEN', 'PARTIAL', 'CLEARED', 'WRITTEN_OFF');

-- --- Trips ------------------------------------------------------------------

create type public.trip_status as enum (
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

-- --- Maintenance ------------------------------------------------------------

create type public.maintenance_record_type as enum (
  'PROBLEM_REPORTED',
  'REGULAR_SERVICE',
  'REPAIR'
);

create type public.maintenance_status as enum (
  'PROBLEM_REPORTED',
  'INSPECTION_PENDING',
  'REPAIR_AUTHORIZED',
  'REPAIR_IN_PROGRESS',
  'STILL_GROUNDED',
  'RETURNED_TO_SERVICE',
  'ADDITIONAL_PROBLEM_FOUND',
  'COMPLETED_AND_VERIFIED'
);

-- The word "Safe" is reserved: it must never appear as a vehicle status. This
-- is a separate axis — whether the vehicle is fit to drive right now.
create type public.roadworthiness as enum (
  'ROADWORTHY',
  'LIMITED_USE',
  'NOT_ROADWORTHY',
  'UNKNOWN'
);

create type public.maintenance_handled_by as enum (
  'FAMILY_WORKSHOP',
  'APPROVED_MECHANIC',
  'PARK_MECHANIC',
  'OTHER'
);

create type public.problem_descriptor as enum (
  'NOT_WORKING',
  'WORN',
  'DAMAGED',
  'MAKING_NOISE',
  'LEAKING',
  'WEAK_PERFORMANCE',
  'NEEDS_INSPECTION',
  'NEEDS_REPLACEMENT',
  'INTERMITTENT_PROBLEM',
  'OTHER'
);

create type public.part_source as enum ('NONE', 'NEW', 'USED', 'EXISTING_REPAIRED');

-- Oil changes only.
create type public.filter_action as enum ('NEW_FILTER', 'REUSED', 'NOT_CHANGED');

-- --- Alerts -----------------------------------------------------------------

create type public.alert_severity as enum ('NORMAL', 'OVERDUE');

create type public.alert_type as enum (
  'MAINTENANCE_DUE',
  'MAINTENANCE_OVERDUE',
  'VEHICLE_GROUNDED',
  'BALANCE_OUTSTANDING',
  'MISSED_PAYMENT',
  'UNUSUAL_EXPENSE',
  'DISPUTED_EXPENSE',
  'RECONCILIATION_DIFFERENCE',
  'VEHICLE_BELOW_TARGET',
  'SAVINGS_BEHIND',
  'PURCHASE_DATE_WITHOUT_FUNDS',
  'DEPOSIT_OR_INSTALLMENT_DUE',
  'SHIPPING_DEPARTURE',
  'EXPECTED_PORT_ARRIVAL',
  'ARRIVAL_DELAY',
  'CUSTOMS_DEADLINE',
  'DEMURRAGE_RISK',
  'REGISTRATION_DUE',
  'INSURANCE_DUE',
  'MISSING_DOCUMENTS',
  'VEHICLE_READY_FOR_ONBOARDING'
);

-- --- Future purchases -------------------------------------------------------

create type public.vehicle_condition as enum ('NEW', 'USED');

create type public.fuel_type as enum ('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'OTHER');

create type public.transmission_type as enum ('MANUAL', 'AUTOMATIC', 'OTHER');

create type public.purchase_priority as enum ('LOW', 'MEDIUM', 'HIGH');

create type public.purchase_goal_status as enum (
  'ACTIVE',
  'ON_HOLD',
  'ACHIEVED',
  'CANCELLED'
);

create type public.purchase_stage as enum (
  'IDEA_CONSIDERING',
  'RESEARCHING',
  'SAVING',
  'READY_TO_PURCHASE',
  'SELLER_SELECTED',
  'DEPOSIT_PAID',
  'FULLY_PURCHASED',
  'AWAITING_SHIPMENT',
  'IN_TRANSIT',
  'ARRIVED_AT_PORT',
  'CUSTOMS_CLEARING',
  'TRANSPORTING_FROM_PORT',
  'INSPECTION_AND_REGISTRATION',
  'READY_FOR_ONBOARDING',
  'ACTIVE_IN_SERVICE',
  'CANCELLED'
);

create type public.acquisition_payment_type as enum ('DEPOSIT', 'INSTALLMENT', 'FINAL');

-- The landed-cost breakdown from SPEC section 4. Estimated and actual are
-- captured for every one of these.
create type public.acquisition_cost_category as enum (
  'VEHICLE_PRICE',
  'PRE_PURCHASE_INSPECTION',
  'AUCTION_FEES',
  'SELLER_OR_AGENT_FEES',
  'INLAND_TRANSPORT_TO_PORT',
  'EXPORT_DOCUMENTATION',
  'SHIPPING',
  'MARINE_INSURANCE',
  'PORT_AND_TERMINAL_CHARGES',
  'CUSTOMS_DUTIES',
  'CLEARING_AGENT_FEES',
  'STORAGE_OR_DEMURRAGE',
  'TRANSPORT_FROM_PORT',
  'REGISTRATION',
  'PLATES',
  'ROADWORTHINESS_INSPECTION',
  'INSURANCE',
  'INITIAL_REPAIRS',
  'SPARE_PARTS',
  'TYRES',
  'BATTERY',
  'OIL_AND_FLUIDS',
  'BRANDING_OR_PAINTING',
  'GPS_EQUIPMENT',
  'OTHER',
  'CONTINGENCY'
);

-- --- Documents --------------------------------------------------------------

create type public.document_type as enum (
  'VEHICLE_PHOTO',
  'DRIVER_PHOTO',
  'DRIVER_ID',
  'DRIVER_LICENCE',
  'PURCHASE_AGREEMENT',
  'BILL_OF_LADING',
  'RECEIPT',
  'REGISTRATION',
  'INSURANCE',
  'ROADWORTHINESS_CERTIFICATE',
  'EXPORT_DOCUMENT',
  'CUSTOMS_DOCUMENT',
  'OTHER'
);
