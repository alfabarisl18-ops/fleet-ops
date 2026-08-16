import { supabase } from '@/lib/supabase'
import type { AlertListItem } from '@/data/alerts'
import type { Enums } from '@/types/db'
import { rpcArgs } from '@/types/db'

// Screens never call Supabase directly — same convention as src/data/accounting.ts.
// camelCase in and out; snake_case stays inside this file. The whole Future
// Purchases workspace is desktop-only via RLS (Phase 1) — no offline queue
// here, unlike the mobile-reachable functions in src/data/vehicles.ts /
// dailyPayments.ts.

export type PurchaseStage = Enums<'purchase_stage'>
export type PurchasePriority = Enums<'purchase_priority'>
export type PurchaseGoalStatus = Enums<'purchase_goal_status'>
export type AcquisitionCostCategory = Enums<'acquisition_cost_category'>
export type AcquisitionPaymentType = Enums<'acquisition_payment_type'>
export type VehicleCondition = Enums<'vehicle_condition'>
export type FuelType = Enums<'fuel_type'>
export type TransmissionType = Enums<'transmission_type'>

/** SPEC's own ordering for "Stages, shown on the purchase card" — also
 *  drives the "Advance to <next>" primary action on PlannedVehicleDetailScreen.
 *  CANCELLED is reachable from any stage but has no "next" of its own. */
export const PURCHASE_STAGE_ORDER: PurchaseStage[] = [
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
]

async function freetownToday(): Promise<string> {
  const { data, error } = await supabase.rpc('freetown_today')
  if (error) throw error
  return data
}

// --- Home summary ------------------------------------------------------

export interface FuturePurchasesSummary {
  activeGoals: number
  amountSavedMinor: number
  amountStillRequiredMinor: number
  vehiclesPurchased: number
  vehiclesInTransit: number
  vehiclesAtPort: number
  readyForOnboarding: number
  overduePurchaseActions: number
}

const AT_PORT_STAGES: PurchaseStage[] = ['ARRIVED_AT_PORT', 'CUSTOMS_CLEARING']
const PURCHASED_STAGES: PurchaseStage[] = [
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
]

/** The 21-type alert_type enum only wires 12 to Future Purchases (Phase 10) —
 *  the rest belong to Maintenance/Alerts/Accounting. Kept here, not in
 *  src/data/alerts.ts, since it's this screen's own filter, not a general one. */
const FUTURE_PURCHASES_ALERT_TYPES: Enums<'alert_type'>[] = [
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
  'VEHICLE_READY_FOR_ONBOARDING',
]

export async function fetchFuturePurchasesSummary(): Promise<FuturePurchasesSummary> {
  const [{ data: goals, error: gError }, { data: vehicles, error: vError }, { count: overdueCount, error: oError }] = await Promise.all([
    supabase.from('purchase_goals').select('id, status, savings_targets(total_budget_minor), cash_reservations(amount_minor, released_at)'),
    supabase.from('planned_vehicles').select('stage'),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('severity', 'OVERDUE').is('resolved_at', null).in('type', FUTURE_PURCHASES_ALERT_TYPES),
  ])
  if (gError) throw gError
  if (vError) throw vError
  if (oError) throw oError

  let amountSavedMinor = 0
  let amountStillRequiredMinor = 0
  let activeGoals = 0
  for (const g of goals ?? []) {
    if (g.status === 'ACTIVE') activeGoals += 1
    const saved = (g.cash_reservations ?? [])
      .filter((r: { released_at: string | null }) => r.released_at === null)
      .reduce((sum: number, r: { amount_minor: number }) => sum + r.amount_minor, 0)
    amountSavedMinor += saved
    // savings_targets.goal_id is UNIQUE, so PostgREST embeds it as a single
    // object (or null), not an array, unlike cash_reservations above —
    // treating it as an array here silently read undefined every time.
    const savingsTarget = g.savings_targets as { total_budget_minor: number } | null
    const budget = savingsTarget?.total_budget_minor ?? 0
    amountStillRequiredMinor += Math.max(budget - saved, 0)
  }

  const stages = (vehicles ?? []).map((v) => v.stage)
  return {
    activeGoals,
    amountSavedMinor,
    amountStillRequiredMinor,
    vehiclesPurchased: stages.filter((s) => PURCHASED_STAGES.includes(s)).length,
    vehiclesInTransit: stages.filter((s) => s === 'IN_TRANSIT').length,
    vehiclesAtPort: stages.filter((s) => AT_PORT_STAGES.includes(s)).length,
    readyForOnboarding: stages.filter((s) => s === 'READY_FOR_ONBOARDING').length,
    overduePurchaseActions: overdueCount ?? 0,
  }
}

/** Backs the "Overdue Purchase Actions" card — SPEC: "Cards, all clickable."
 *  Reuses AlertListItem's shape so DesktopWorkspace's existing viewForAlert
 *  can route a tap the same way the bell already does. */
export async function fetchOverduePurchaseActions(): Promise<AlertListItem[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select('id, type, severity, subject_type, subject_id, vehicle_id, driver_id, due_on, created_at, reviewed_at')
    .eq('severity', 'OVERDUE')
    .is('resolved_at', null)
    .in('type', FUTURE_PURCHASES_ALERT_TYPES)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    subjectType: a.subject_type,
    subjectId: a.subject_id,
    vehicleId: a.vehicle_id,
    driverId: a.driver_id,
    dueOn: a.due_on,
    createdAt: a.created_at,
    reviewedAt: a.reviewed_at,
  }))
}

// --- Purchase goals ------------------------------------------------------

export interface PurchaseGoalListItem {
  id: string
  name: string
  vehicleType: Enums<'vehicle_type'>
  vehiclesRequired: number
  status: PurchaseGoalStatus
  priority: PurchasePriority
  targetPurchaseDate: string | null
  savedMinor: number
  budgetMinor: number | null
}

export async function fetchPurchaseGoals(): Promise<PurchaseGoalListItem[]> {
  const { data, error } = await supabase
    .from('purchase_goals')
    .select('id, name, vehicle_type, vehicles_required, status, priority, target_purchase_date, savings_targets(total_budget_minor), cash_reservations(amount_minor, released_at)')
    .order('priority', { ascending: false })
    .order('target_purchase_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []).map((g) => {
    // savings_targets.goal_id is UNIQUE, so this embed comes back as a
    // single object (or null), not an array — see fetchFuturePurchasesSummary.
    const savingsTarget = g.savings_targets as { total_budget_minor: number } | null
    const savedMinor = (g.cash_reservations ?? [])
      .filter((r: { released_at: string | null }) => r.released_at === null)
      .reduce((sum: number, r: { amount_minor: number }) => sum + r.amount_minor, 0)
    return {
      id: g.id,
      name: g.name,
      vehicleType: g.vehicle_type,
      vehiclesRequired: g.vehicles_required,
      status: g.status,
      priority: g.priority,
      targetPurchaseDate: g.target_purchase_date,
      savedMinor,
      budgetMinor: savingsTarget?.total_budget_minor ?? null,
    }
  })
}

export interface PurchaseGoalDetail {
  id: string
  name: string
  vehicleType: Enums<'vehicle_type'>
  customType: string | null
  vehiclesRequired: number
  condition: VehicleCondition | null
  make: string | null
  model: string | null
  modelYear: number | null
  color: string | null
  fuelType: FuelType | null
  transmission: TransmissionType | null
  marketCountry: string | null
  seller: string | null
  intendedRoute: string | null
  targetPurchaseDate: string | null
  expectedArrivalDate: string | null
  priority: PurchasePriority
  status: PurchaseGoalStatus
  notes: string | null
}

export async function fetchPurchaseGoal(id: string): Promise<PurchaseGoalDetail | null> {
  const { data, error } = await supabase
    .from('purchase_goals')
    .select(
      'id, name, vehicle_type, custom_type, vehicles_required, condition, make, model, model_year, color, fuel_type, transmission, market_country, seller, intended_route, target_purchase_date, expected_arrival_date, priority, status, notes',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    name: data.name,
    vehicleType: data.vehicle_type,
    customType: data.custom_type,
    vehiclesRequired: data.vehicles_required,
    condition: data.condition,
    make: data.make,
    model: data.model,
    modelYear: data.model_year,
    color: data.color,
    fuelType: data.fuel_type,
    transmission: data.transmission,
    marketCountry: data.market_country,
    seller: data.seller,
    intendedRoute: data.intended_route,
    targetPurchaseDate: data.target_purchase_date,
    expectedArrivalDate: data.expected_arrival_date,
    priority: data.priority,
    status: data.status,
    notes: data.notes,
  }
}

export interface CreatePurchaseGoalInput {
  name: string
  vehicleType: Enums<'vehicle_type'>
  customType?: string
  vehiclesRequired: number
  condition?: VehicleCondition
  make?: string
  model?: string
  modelYear?: number
  color?: string
  fuelType?: FuelType
  transmission?: TransmissionType
  marketCountry?: string
  seller?: string
  intendedRoute?: string
  targetPurchaseDate?: string
  expectedArrivalDate?: string
  priority: PurchasePriority
  notes?: string
  createdBy: string
}

export async function createPurchaseGoal(input: CreatePurchaseGoalInput): Promise<string> {
  const { data, error } = await supabase
    .from('purchase_goals')
    .insert({
      client_record_id: crypto.randomUUID(),
      name: input.name,
      vehicle_type: input.vehicleType,
      custom_type: input.customType ?? null,
      vehicles_required: input.vehiclesRequired,
      condition: input.condition ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      model_year: input.modelYear ?? null,
      color: input.color ?? null,
      fuel_type: input.fuelType ?? null,
      transmission: input.transmission ?? null,
      market_country: input.marketCountry ?? null,
      seller: input.seller ?? null,
      intended_route: input.intendedRoute ?? null,
      target_purchase_date: input.targetPurchaseDate ?? null,
      expected_arrival_date: input.expectedArrivalDate ?? null,
      priority: input.priority,
      notes: input.notes ?? null,
      created_by: input.createdBy,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updatePurchaseGoalStatus(goalId: string, status: PurchaseGoalStatus): Promise<void> {
  const { error } = await supabase.from('purchase_goals').update({ status }).eq('id', goalId)
  if (error) throw error
}

// --- Savings targets & cash reservations ----------------------------------

export interface SavingsTarget {
  id: string
  goalId: string
  totalBudgetMinor: number
  targetDate: string | null
  weeklyTargetMinor: number | null
  monthlyTargetMinor: number | null
  profitReservePct: number | null
  minOperatingCashMinor: number
  minEmergencyReserveMinor: number
}

export async function fetchSavingsTarget(goalId: string): Promise<SavingsTarget | null> {
  const { data, error } = await supabase
    .from('savings_targets')
    .select('id, goal_id, total_budget_minor, target_date, weekly_target_minor, monthly_target_minor, profit_reserve_pct, min_operating_cash_minor, min_emergency_reserve_minor')
    .eq('goal_id', goalId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    goalId: data.goal_id,
    totalBudgetMinor: data.total_budget_minor,
    targetDate: data.target_date,
    weeklyTargetMinor: data.weekly_target_minor,
    monthlyTargetMinor: data.monthly_target_minor,
    profitReservePct: data.profit_reserve_pct,
    minOperatingCashMinor: data.min_operating_cash_minor,
    minEmergencyReserveMinor: data.min_emergency_reserve_minor,
  }
}

export interface SetSavingsTargetInput {
  goalId: string
  totalBudgetMinor: number
  targetDate?: string
  weeklyTargetMinor?: number
  monthlyTargetMinor?: number
  profitReservePct?: number
  minOperatingCashMinor?: number
  minEmergencyReserveMinor?: number
}

/** One savings_targets row per goal (unique on goal_id) — create it the
 *  first time, update thereafter. Desktop-only, same as every other
 *  Future Purchases write. */
export async function setSavingsTarget(input: SetSavingsTargetInput): Promise<void> {
  const existing = await fetchSavingsTarget(input.goalId)
  const row = {
    total_budget_minor: input.totalBudgetMinor,
    target_date: input.targetDate ?? null,
    weekly_target_minor: input.weeklyTargetMinor ?? null,
    monthly_target_minor: input.monthlyTargetMinor ?? null,
    profit_reserve_pct: input.profitReservePct ?? null,
    min_operating_cash_minor: input.minOperatingCashMinor ?? 0,
    min_emergency_reserve_minor: input.minEmergencyReserveMinor ?? 0,
  }
  if (existing) {
    const { error } = await supabase.from('savings_targets').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('savings_targets')
      .insert({ client_record_id: crypto.randomUUID(), goal_id: input.goalId, ...row })
    if (error) throw error
  }
}

export interface CashReservation {
  id: string
  goalId: string
  amountMinor: number
  reservedAt: string
  releasedAt: string | null
  note: string | null
}

export async function fetchCashReservations(goalId: string): Promise<CashReservation[]> {
  const { data, error } = await supabase
    .from('cash_reservations')
    .select('id, goal_id, amount_minor, reserved_at, released_at, note')
    .eq('goal_id', goalId)
    .order('reserved_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    goalId: r.goal_id,
    amountMinor: r.amount_minor,
    reservedAt: r.reserved_at,
    releasedAt: r.released_at,
    note: r.note,
  }))
}

/** Owner/Admin only, enforced by cash_reservations_insert's own RLS
 *  (app.is_owner()) — reserving business cash directly reduces what the
 *  operation can spend. The UI hides this action for Fleet Manager
 *  (matching VehicleProfileScreen's TargetPanel-style gating); this is
 *  convenience only, the real enforcement is server-side. */
export async function reserveCash(goalId: string, amountMinor: number, currentUserId: string, note?: string): Promise<void> {
  const { error } = await supabase
    .from('cash_reservations')
    .insert({ client_record_id: crypto.randomUUID(), goal_id: goalId, amount_minor: amountMinor, reserved_by: currentUserId, note: note ?? null })
  if (error) throw error
}

export async function releaseCash(reservationId: string, currentUserId: string): Promise<void> {
  const { error } = await supabase.from('cash_reservations').update({ released_by: currentUserId }).eq('id', reservationId)
  if (error) throw error
}

// --- Planned vehicles (candidates) ----------------------------------------

export interface PlannedVehicleListItem {
  id: string
  goalId: string
  sequence: number
  stage: PurchaseStage
  targetDate: string | null
  purchasedAt: string | null
  onboardedVehicleId: string | null
}

export async function fetchPlannedVehicles(goalId: string): Promise<PlannedVehicleListItem[]> {
  const { data, error } = await supabase
    .from('planned_vehicles')
    .select('id, goal_id, sequence, stage, target_date, purchased_at, onboarded_vehicle_id')
    .eq('goal_id', goalId)
    .order('sequence')
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    goalId: p.goal_id,
    sequence: p.sequence,
    stage: p.stage,
    targetDate: p.target_date,
    purchasedAt: p.purchased_at,
    onboardedVehicleId: p.onboarded_vehicle_id,
  }))
}

export interface PlannedVehicleAcrossGoals extends PlannedVehicleListItem {
  goalName: string
  goalVehicleType: Enums<'vehicle_type'>
}

/** Backs the Home cards that list across every goal at once (Vehicles
 *  Purchased, Vehicles in Transit, Vehicles at Port, Ready for Onboarding)
 *  — fetchPlannedVehicles above is scoped to one goal, for the goal detail
 *  screen's own candidate list. */
export async function fetchPlannedVehiclesByStages(stages: PurchaseStage[]): Promise<PlannedVehicleAcrossGoals[]> {
  const { data, error } = await supabase
    .from('planned_vehicles')
    .select('id, goal_id, sequence, stage, target_date, purchased_at, onboarded_vehicle_id, purchase_goals(name, vehicle_type)')
    .in('stage', stages)
    .order('target_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []).map((p) => {
    const goal = p.purchase_goals as unknown as { name: string; vehicle_type: Enums<'vehicle_type'> } | null
    return {
      id: p.id,
      goalId: p.goal_id,
      sequence: p.sequence,
      stage: p.stage,
      targetDate: p.target_date,
      purchasedAt: p.purchased_at,
      onboardedVehicleId: p.onboarded_vehicle_id,
      goalName: goal?.name ?? '(unknown goal)',
      goalVehicleType: goal?.vehicle_type ?? 'OTHER',
    }
  })
}

/** Adds a candidate vehicle to a goal — SPEC's "Comparison across candidate
 *  vehicles" is literally goal.planned_vehicles while they're still at an
 *  early stage; there is no separate "candidate" concept in the schema. */
export async function addPlannedVehicle(goalId: string, targetDate?: string): Promise<string> {
  const existing = await fetchPlannedVehicles(goalId)
  const nextSequence = existing.reduce((max, p) => Math.max(max, p.sequence), 0) + 1
  const { data, error } = await supabase
    .from('planned_vehicles')
    .insert({ client_record_id: crypto.randomUUID(), goal_id: goalId, sequence: nextSequence, target_date: targetDate ?? null })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export interface PlannedVehicleDetail extends PlannedVehicleListItem {
  goalName: string
  goalVehicleType: Enums<'vehicle_type'>
}

export async function fetchPlannedVehicle(id: string): Promise<PlannedVehicleDetail | null> {
  const { data, error } = await supabase
    .from('planned_vehicles')
    .select('id, goal_id, sequence, stage, target_date, purchased_at, onboarded_vehicle_id, purchase_goals(name, vehicle_type)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const goal = data.purchase_goals as unknown as { name: string; vehicle_type: Enums<'vehicle_type'> } | null
  return {
    id: data.id,
    goalId: data.goal_id,
    sequence: data.sequence,
    stage: data.stage,
    targetDate: data.target_date,
    purchasedAt: data.purchased_at,
    onboardedVehicleId: data.onboarded_vehicle_id,
    goalName: goal?.name ?? '(unknown goal)',
    goalVehicleType: goal?.vehicle_type ?? 'OTHER',
  }
}

/**
 * Every stage transition except into ACTIVE_IN_SERVICE (onboardVehicle is
 * the only path there — pv_active_in_service_is_onboarded enforces this at
 * the database level). purchased_at is stamped here, from the server's own
 * clock via freetownToday() — never new Date() — the first time a plan
 * reaches FULLY_PURCHASED, matching CLAUDE.md's business-date rule.
 */
export async function changePlannedVehicleStage(plannedVehicleId: string, toStage: PurchaseStage): Promise<void> {
  const row: { stage: PurchaseStage; purchased_at?: string } = { stage: toStage }
  if (toStage === 'FULLY_PURCHASED') {
    row.purchased_at = await freetownToday()
  }
  const { error } = await supabase.from('planned_vehicles').update(row).eq('id', plannedVehicleId)
  if (error) throw error
}

// --- Landed cost -----------------------------------------------------------

export interface AcquisitionCostLine {
  id: string
  plannedVehicleId: string
  costCategory: AcquisitionCostCategory
  estimatedMinor: number | null
  actualMinor: number | null
  ledgerEntryId: string | null
  note: string | null
}

export async function fetchAcquisitionCostLines(plannedVehicleId: string): Promise<AcquisitionCostLine[]> {
  const { data, error } = await supabase
    .from('acquisition_cost_lines')
    .select('id, planned_vehicle_id, cost_category, estimated_minor, actual_minor, ledger_entry_id, note')
    .eq('planned_vehicle_id', plannedVehicleId)
  if (error) throw error
  return (data ?? []).map((l) => ({
    id: l.id,
    plannedVehicleId: l.planned_vehicle_id,
    costCategory: l.cost_category,
    estimatedMinor: l.estimated_minor,
    actualMinor: l.actual_minor,
    ledgerEntryId: l.ledger_entry_id,
    note: l.note,
  }))
}

/**
 * One row per category (planned_vehicle_id, cost_category) is unique —
 * upsert on that pair. actual_minor set here is a plain field edit, not
 * routed through the ledger: SPEC's structural rule 6 only cares that the
 * landed-cost TOTAL never double-counts a cost that already came through
 * Accounting (ledger_entry_id set) — a category with no ledger_entry_id is
 * simply a manually-tracked actual, same as before any RPC touched it.
 */
export async function setAcquisitionCostLine(
  plannedVehicleId: string,
  category: AcquisitionCostCategory,
  estimatedMinor: number | null,
  actualMinor: number | null,
  note?: string,
): Promise<void> {
  const { error } = await supabase
    .from('acquisition_cost_lines')
    .upsert(
      {
        client_record_id: crypto.randomUUID(),
        planned_vehicle_id: plannedVehicleId,
        cost_category: category,
        estimated_minor: estimatedMinor,
        actual_minor: actualMinor,
        note: note ?? null,
      },
      { onConflict: 'planned_vehicle_id,cost_category' },
    )
  if (error) throw error
}

// --- Acquisition payments ---------------------------------------------------

export interface AcquisitionPayment {
  id: string
  plannedVehicleId: string
  paymentType: AcquisitionPaymentType
  amountMinor: number
  paidOn: string
  method: string | null
  paidTo: string | null
  originalCurrency: string | null
  originalAmountMinor: number | null
  exchangeRate: number | null
  nextDueOn: string | null
  enteredAt: string
}

export async function fetchAcquisitionPayments(plannedVehicleId: string): Promise<AcquisitionPayment[]> {
  const { data, error } = await supabase
    .from('acquisition_payments')
    .select('id, planned_vehicle_id, payment_type, amount_minor, paid_on, method, paid_to, original_currency, original_amount_minor, exchange_rate, next_due_on, entered_at')
    .eq('planned_vehicle_id', plannedVehicleId)
    .order('paid_on', { ascending: false })
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    plannedVehicleId: p.planned_vehicle_id,
    paymentType: p.payment_type,
    amountMinor: p.amount_minor,
    paidOn: p.paid_on,
    method: p.method,
    paidTo: p.paid_to,
    originalCurrency: p.original_currency,
    originalAmountMinor: p.original_amount_minor,
    exchangeRate: p.exchange_rate,
    nextDueOn: p.next_due_on,
    enteredAt: p.entered_at,
  }))
}

export interface RecordAcquisitionPaymentInput {
  plannedVehicleId: string
  paymentType: AcquisitionPaymentType
  amountMinor: number
  paidOn: string
  method?: string
  paidTo?: string
  originalCurrency?: string
  originalAmountMinor?: number
  exchangeRate?: number
  nextDueOn?: string
}

/** Records a payment and its matching VEHICLE_PURCHASE ledger expense in
 *  one transaction (public.record_acquisition_payment). */
export async function recordAcquisitionPayment(input: RecordAcquisitionPaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc(
    'record_acquisition_payment',
    rpcArgs<'record_acquisition_payment'>({
      p_client_record_id: crypto.randomUUID(),
      p_planned_vehicle_id: input.plannedVehicleId,
      p_payment_type: input.paymentType,
      p_amount_minor: input.amountMinor,
      p_paid_on: input.paidOn,
      p_method: input.method ?? null,
      p_paid_to: input.paidTo ?? null,
      p_original_currency: input.originalCurrency ?? null,
      p_original_amount_minor: input.originalAmountMinor ?? null,
      p_exchange_rate: input.exchangeRate ?? null,
      p_next_due_on: input.nextDueOn ?? null,
    }),
  )
  if (error) throw error
  return data
}

/** For alert deep-links: a TRANSIT_RECORD alert's subject_id is the
 *  transit_records row, but PlannedVehicleDetailScreen is keyed by
 *  planned_vehicle_id — one small lookup bridges the two. */
export async function fetchTransitRecordPlannedVehicleId(transitRecordId: string): Promise<string | null> {
  const { data, error } = await supabase.from('transit_records').select('planned_vehicle_id').eq('id', transitRecordId).maybeSingle()
  if (error) throw error
  return data?.planned_vehicle_id ?? null
}

// --- Transit -----------------------------------------------------------

export interface TransitRecord {
  id: string
  plannedVehicleId: string
  vin: string | null
  engineNumber: string | null
  mileage: number | null
  condition: string | null
  purchaseLocation: string | null
  exportCountry: string | null
  exportPort: string | null
  destinationPort: string | null
  shippingCompany: string | null
  vesselName: string | null
  billOfLading: string | null
  shippedOn: string | null
  expectedArrival: string | null
  actualArrival: string | null
  currentLocation: string | null
  clearingAgent: string | null
}

export async function fetchTransitRecord(plannedVehicleId: string): Promise<TransitRecord | null> {
  const { data, error } = await supabase
    .from('transit_records')
    .select(
      'id, planned_vehicle_id, vin, engine_number, mileage, condition, purchase_location, export_country, export_port, destination_port, shipping_company, vessel_name, bill_of_lading, shipped_on, expected_arrival, actual_arrival, current_location, clearing_agent',
    )
    .eq('planned_vehicle_id', plannedVehicleId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    plannedVehicleId: data.planned_vehicle_id,
    vin: data.vin,
    engineNumber: data.engine_number,
    mileage: data.mileage,
    condition: data.condition,
    purchaseLocation: data.purchase_location,
    exportCountry: data.export_country,
    exportPort: data.export_port,
    destinationPort: data.destination_port,
    shippingCompany: data.shipping_company,
    vesselName: data.vessel_name,
    billOfLading: data.bill_of_lading,
    shippedOn: data.shipped_on,
    expectedArrival: data.expected_arrival,
    actualArrival: data.actual_arrival,
    currentLocation: data.current_location,
    clearingAgent: data.clearing_agent,
  }
}

export interface TransitRecordInput {
  vin?: string
  engineNumber?: string
  mileage?: number
  condition?: string
  purchaseLocation?: string
  exportCountry?: string
  exportPort?: string
  destinationPort?: string
  shippingCompany?: string
  vesselName?: string
  billOfLading?: string
  shippedOn?: string
  expectedArrival?: string
  actualArrival?: string
  currentLocation?: string
  clearingAgent?: string
}

/** One transit_records row per planned vehicle (unique) — create it the
 *  first time transit details are entered, update thereafter. Setting
 *  shipped_on for the first time raises SHIPPING_DEPARTURE (a database
 *  trigger, not this function's job). */
export async function setTransitRecord(plannedVehicleId: string, input: TransitRecordInput): Promise<void> {
  const existing = await fetchTransitRecord(plannedVehicleId)
  const row = {
    vin: input.vin ?? null,
    engine_number: input.engineNumber ?? null,
    mileage: input.mileage ?? null,
    condition: input.condition ?? null,
    purchase_location: input.purchaseLocation ?? null,
    export_country: input.exportCountry ?? null,
    export_port: input.exportPort ?? null,
    destination_port: input.destinationPort ?? null,
    shipping_company: input.shippingCompany ?? null,
    vessel_name: input.vesselName ?? null,
    bill_of_lading: input.billOfLading ?? null,
    shipped_on: input.shippedOn ?? null,
    expected_arrival: input.expectedArrival ?? null,
    actual_arrival: input.actualArrival ?? null,
    current_location: input.currentLocation ?? null,
    clearing_agent: input.clearingAgent ?? null,
  }
  if (existing) {
    const { error } = await supabase.from('transit_records').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('transit_records')
      .insert({ client_record_id: crypto.randomUUID(), planned_vehicle_id: plannedVehicleId, ...row })
    if (error) throw error
  }
}

// --- Onboarding --------------------------------------------------------

export interface OnboardVehicleInput {
  plannedVehicleId: string
  fleetId: string
  plate?: string
  currentDriverId?: string
  routeId?: string
  expectedDailyAmountMinor: number
  yearlyTargetMinor: number
  enteredServiceOn?: string
  status: Enums<'vehicle_status'>
}

/** Creates the real vehicles row and closes out the planned vehicle in one
 *  transaction (public.onboard_vehicle) — only reachable at
 *  READY_FOR_ONBOARDING, enforced both by the RPC and the
 *  pv_active_in_service_is_onboarded check constraint. */
export async function onboardVehicle(input: OnboardVehicleInput): Promise<string> {
  const { data, error } = await supabase.rpc(
    'onboard_vehicle',
    rpcArgs<'onboard_vehicle'>({
      p_client_record_id: crypto.randomUUID(),
      p_planned_vehicle_id: input.plannedVehicleId,
      p_fleet_id: input.fleetId,
      p_plate: input.plate ?? null,
      p_current_driver_id: input.currentDriverId ?? null,
      p_route_id: input.routeId ?? null,
      p_expected_daily_amount_minor: input.expectedDailyAmountMinor,
      p_yearly_target_minor: input.yearlyTargetMinor,
      p_entered_service_on: input.enteredServiceOn ?? null,
      p_status: input.status,
    }),
  )
  if (error) throw error
  return data
}

// --- Forecasting -------------------------------------------------------

export interface Forecast {
  avgMonthlyIncomeMinor: number
  avgMonthlyExpenseMinor: number
  avgMonthlyProfitMinor: number
  outstandingBalancesMinor: number
  currentSavedMinor: number
  monthlyAvailableToSaveMinor: number
  projectedFundedDate: string | null
}

/** "Forecasting from actual accounting data" — reads the last 3 complete
 *  calendar months of ledger_entries the same way Accounting's own summary
 *  screens already do (src/data/accounting.ts), plus this goal's own saved
 *  amount and remaining need. Best-case/expected/conservative aren't three
 *  separate numbers here — SPEC's example ("expected to be fully funded by
 *  15 March 2027") is one plain-language sentence computed from the single
 *  average-savings-rate projection; the screen layer renders best case as
 *  the projection at 1.25x the monthly rate and conservative at 0.75x
 *  rather than this module tracking three parallel figures. */
export async function fetchForecast(goalId: string): Promise<Forecast> {
  const today = await freetownToday()
  const threeMonthsAgo = new Date(today)
  threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3)
  const from = threeMonthsAgo.toISOString().slice(0, 10)

  const [{ data: entries, error: eError }, { data: balances, error: bError }, { data: reservations, error: rError }, target] = await Promise.all([
    supabase.from('ledger_entries').select('direction, amount_minor').gte('applies_to_date', from).lte('applies_to_date', today).is('superseded_by_id', null),
    supabase.from('outstanding_balances').select('remaining_amount_minor').in('status', ['OPEN', 'PARTIAL']),
    supabase.from('cash_reservations').select('amount_minor, released_at').eq('goal_id', goalId),
    fetchSavingsTarget(goalId),
  ])
  if (eError) throw eError
  if (bError) throw bError
  if (rError) throw rError

  const incomeMinor = (entries ?? []).filter((e) => e.direction === 'INCOME').reduce((sum, e) => sum + e.amount_minor, 0)
  const expenseMinor = (entries ?? []).filter((e) => e.direction === 'EXPENSE').reduce((sum, e) => sum + e.amount_minor, 0)
  // Math.trunc, not Math.round — the project's lint rule flags Math.round
  // as a float-money smell (CLAUDE.md); truncating an already-integer
  // minor-unit sum down to a whole minor unit is the house convention
  // (src/lib/money.ts does the same for display formatting).
  const avgMonthlyIncomeMinor = Math.trunc(incomeMinor / 3)
  const avgMonthlyExpenseMinor = Math.trunc(expenseMinor / 3)
  const avgMonthlyProfitMinor = avgMonthlyIncomeMinor - avgMonthlyExpenseMinor
  const outstandingBalancesMinor = (balances ?? []).reduce((sum, b) => sum + b.remaining_amount_minor, 0)
  const currentSavedMinor = (reservations ?? []).filter((r) => r.released_at === null).reduce((sum, r) => sum + r.amount_minor, 0)

  const profitReservePct = target?.profitReservePct ?? 0
  const monthlyAvailableToSaveMinor = target?.monthlyTargetMinor ?? Math.max(Math.trunc((avgMonthlyProfitMinor * profitReservePct) / 100), 0)

  let projectedFundedDate: string | null = null
  if (target && monthlyAvailableToSaveMinor > 0) {
    const remaining = Math.max(target.totalBudgetMinor - currentSavedMinor, 0)
    const monthsNeeded = Math.ceil(remaining / monthlyAvailableToSaveMinor)
    const projected = new Date(today)
    projected.setUTCMonth(projected.getUTCMonth() + monthsNeeded)
    projectedFundedDate = projected.toISOString().slice(0, 10)
  }

  return {
    avgMonthlyIncomeMinor,
    avgMonthlyExpenseMinor,
    avgMonthlyProfitMinor,
    outstandingBalancesMinor,
    currentSavedMinor,
    monthlyAvailableToSaveMinor,
    projectedFundedDate,
  }
}
