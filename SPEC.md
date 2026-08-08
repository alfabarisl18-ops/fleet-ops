# Fleet Operations SL — Product Specification

A private operations system for a family transport business in Sierra Leone.
Tracks vehicles, daily driver payments, drivers, maintenance, accounting, and the
planning and purchase of future vehicles.

This is the authoritative specification. Build to this document.

**Language: English only.**
**Currency: new leones (SLE) only.**

---

## 1. The people who use it

Four roles. Two work on desktop, two on phones in the field.

| Role | Device | Sign-in | Purpose |
|---|---|---|---|
| **Owner/Admin** | Desktop | Email + password | Everything. Manages people, roles, PINs, permissions, vehicles, targets, settings. Approves corrections. |
| **Fleet Manager** | Desktop | Email + password | Full operational, financial, vehicle and maintenance view. Adds and edits records. Approves unusual and disputed expenses. Keeps the books. Cannot create administrators, change the Owner account, or control system security. |
| **Collections & Finance** | Phone | 4-digit PIN | Records payments, income and expenses. Nothing else. |
| **Maintenance & Repairs** | Phone | 4-digit PIN | Records problems, repairs, parts and vehicle status. Nothing else. |

Rules:

- Role names are professional and reusable. Never "Mother" or "Father".
- **The PIN works on any device.** These are field data-entry tools; they must not
  be tied to a single phone.
- Because of that, mobile roles can **create** records but never edit or delete
  them. Corrections go through the authorized workflow.
- Owner can reset any PIN. Mobile sessions expire on inactivity.
- **No alerts bell in either mobile workspace.**
- Mobile users cannot edit their profile or permissions.
- **Every permission is enforced on the server.** Hiding a button is not security.
- Never print credentials anywhere in the UI.

---

## 2. Non-negotiable structural rules

These are decisions that are expensive to reverse. Everything else follows.

1. **Money is stored as integers in minor units.** `amount_minor` = SLE × 100.
   Never floats. Formatting happens at the edge.
2. **Every money record carries two dates.** `applies_to_date` — the day the money
   is *for*. `received_at` — the day it actually arrived. Late bundled payments are
   impossible without both.
3. **Money rows are append-only.** Nothing is updated in place. A mistake produces
   a correction row that supersedes the original; both stay in history.
4. **Every insertable row carries a device-generated UUID** (`client_record_id`,
   unique index), created on the phone before it reaches the server. A retried
   sync must never double-record a payment.
5. **Alerts store a concrete target** — `subject_type` + `subject_id`. Tapping a
   notification opens the exact record, never a general list page.
6. **Acquisition costs link back to ledger entries** so nothing is counted twice.
7. **Vehicle and maintenance status changes are events**, recording who changed
   what and when, not just a column.
8. **Available cash is derived, never stored.** Total cash minus operating
   requirement, emergency reserve, committed and reserved amounts.
9. **Business dates are always Sierra Leone dates.** The team is spread across
   Freetown, the United States and China. `service_date`, `applies_to_date` and
   every other business date is the date in **Africa/Freetown**, computed on the
   server — never the date on the viewer's device. "Recorded today", daily payment
   dates, reminder dates and alert due dates all mean today in Freetown. Event
   timestamps (`entered_at`, `received_at`) are `timestamptz` in UTC and may be
   displayed in the viewer's local time; business dates may not.

---

## 3. Data model

### Identity

**`users`** — `id`, `display_name`, `role`
(`OWNER_ADMIN | FLEET_MANAGER | COLLECTIONS_FINANCE | MAINTENANCE_REPAIRS`),
`email` (desktop only), `password_hash` (desktop only), `pin_hash` (mobile only),
`status`, `created_by`, `created_at`.

**`sessions`** — `user_id`, `issued_at`, `expires_at`, `revoked_at`. No device
binding.

### Fleet

**`vehicles`** — `id`, `client_record_id`, `fleet_id`, `plate`, `type`
(`LONG_SPRINTER | SHORT_SPRINTER | BOX_TRUCK | BUS | GARBAGE_TRUCK | TRICYCLE | OTHER`),
`custom_type`, `custom_description`, `color`, `distinguishing_marks`,
`photo_key`, `route_id`, `current_driver_id`, `purchased_on`,
`purchase_price_minor`, `entered_service_on`, `status`
(`ACTIVE | GROUNDED | IN_MAINTENANCE | ARCHIVED`), `expected_daily_amount_minor`,
`yearly_target_minor`, `expected_retirement_on`, `archived_at`.

Status wording in the UI is **Active**, never "Safe" or "Running".

**`vehicle_status_events`** — `vehicle_id`, `from_status`, `to_status`,
`changed_by`, `changed_at`, `reason`.

**`routes`** — `name`, `description`, `active`.

**`drivers`** — `id`, `client_record_id`, `full_name`, `known_as`, `phone`,
`phone_alt`, `address`, `next_of_kin_name`, `next_of_kin_phone`, `photo_key`,
`id_document_type`, `id_document_number`, `id_image_key`, `licence_number`,
`licence_expiry`, `licence_image_key`, `started_on`, `left_on`, `leave_reason`,
`status` (`ACTIVE | SUSPENDED | FORMER`), `notes`.

Drivers do not sign in. They are subjects, not users. A driver is never deleted —
set to `FORMER`.

**`driver_assignments`** — `driver_id`, `vehicle_id`, `route_id`, `started_on`,
`ended_on`.

**`driver_purchase_agreements`** — `vehicle_id`, `driver_id`,
`agreement_amount_minor`, `regular_payment_minor`, `payment_frequency`,
`started_on`, `expected_completion_on`, `ownership_transfer_status`.

### Money

**`ledger_entries`** (append-only) — `id`, `client_record_id`, `direction`
(`INCOME | EXPENSE`), `amount_minor` (always positive; direction carries the
sign), `currency`, `category`, `subcategory`, `applies_to_date`, `received_at`,
`entered_at`, `entered_by_user_id`, `vehicle_id`, `driver_id`, `source_type`,
`source_id`, `note`, `reconciled_at`, `reconciled_by`, `approval_status`
(`NOT_REQUIRED | PENDING | APPROVED | DISPUTED`), `superseded_by_id`.

Expense categories: parts, labour, maintenance, fuel, road/checkpoint, driver or
helper payment, vehicle purchase, licensing/insurance, other.
Income categories: daily vehicle payment, trip revenue, balance settlement,
driver purchase installment, other income.

Display: expenses render as `−SLE 1,000`. Income positive.

**`corrections`** — `target_table`, `target_id`, `reason`, `requested_by`,
`approved_by`, `requested_at`, `applied_at`, `before_json`, `after_json`.

**`activity_records`** — the Records page projection. Every workflow writes one
row: `record_type`, `target_type`, `target_id`, `vehicle_id`, `driver_id`,
`amount_minor`, `direction`, `applies_to_date`, `entered_at`, `entered_by`,
`summary_text`. This is what makes one searchable, filterable, clickable surface
possible across every kind of record.

**`audit_log`** — `actor_user_id`, `action`, `entity_type`, `entity_id`,
`before_json`, `after_json`, `at`.

### Daily payments

**`daily_payment_records`** — `id`, `client_record_id`, `vehicle_id`, `driver_id`,
`service_date`, `day_outcome`
(`FULL_DAY | HALF_DAY | DRIVERS_DAY | BREAKDOWN | DID_NOT_WORK`),
`expected_amount_minor` (snapshot of the target on that date),
`received_amount_minor`, `shortfall_amount_minor`, `shortfall_treatment`
(`DRIVER_DEBT | ACCEPTED_LOSS`), `shortfall_cause`
(`BREAKDOWN | ACCIDENT | POLICE_CHECKPOINT | OTHER`), `shortfall_note`,
`overpayment_reason` (`SETTLING_BALANCE | ADVANCE | OTHER`),
`ledger_entry_id`, `bundled_payment_id`, `entered_by`, `entered_at`.

**Unique index on `(vehicle_id, service_date)`.** One record per vehicle per day.

`shortfall_treatment` is set by the day outcome, never chosen by the collector.
Only `FULL_DAY` produces `DRIVER_DEBT`.

**`bundled_payments`** — `vehicle_id`, `driver_id`, `total_amount_minor`,
`received_at`, `covers_from_date`, `days_covered`, `covers_to_date` (calculated),
`note`, `entered_by`.

**`outstanding_balances`** — owned by `driver_id`. `vehicle_id` and
`origin_daily_payment_id` are context, not owners. `original_amount_minor`,
`remaining_amount_minor`, `promised_date`, `reminder_date`, `status`
(`OPEN | PARTIAL | CLEARED | WRITTEN_OFF`), `closed_at`.

**`balance_settlements`** — `balance_id`, `ledger_entry_id`, `amount_minor`,
`settled_on`.

**`driver_credits`** — `driver_id`, `amount_minor`, `created_from_payment_id`,
`remaining_minor`, `consumed_on`.

### Trips

**`trips`** — `vehicle_id`, `driver_id`, `helper_name`, `origin`, `destination`,
`cargo`, `departed_on`, `returned_on`, `status`, `notes`. Revenue and costs attach
as ledger entries with `source_type = 'trip'`.

### Maintenance

**`maintenance_orders`** — `id`, `client_record_id`, `vehicle_id`, `record_type`
(`PROBLEM_REPORTED | REGULAR_SERVICE | REPAIR`), `service_area`, `work_action`,
`problem_descriptor`, `status`, `is_grounded`, `safety_status`, `identified_on`,
`expected_inspection_on`, `expected_completion_on`, `estimated_grounded_days`,
`handled_by` (`FAMILY_WORKSHOP | APPROVED_MECHANIC | PARK_MECHANIC | OTHER`),
`old_parts_returned`, `opened_by`, `closed_at`, `verified_by`.

Statuses: Problem reported, Inspection pending, Repair authorized, Repair in
progress, Still grounded, Active/returned to service, Additional problem found,
Completed and verified.

**`maintenance_status_events`** — `order_id`, `from_status`, `to_status`,
`changed_by`, `changed_at`, `note`.

**`maintenance_parts`** — `order_id`, `part_name`, `part_source`
(`NONE | NEW | USED | EXISTING_REPAIRED`), `filter_action`
(`NEW_FILTER | REUSED | NOT_CHANGED`, oil changes only), `quantity`,
`unit_cost_minor`, `ledger_entry_id`.

**`maintenance_notes`** — `order_id`, `body_text`, `entered_by`, `entered_at`.

### Alerts

**`alerts`** — `type`, `severity` (`NORMAL | OVERDUE`), `subject_type`,
`subject_id`, `vehicle_id`, `driver_id`, `due_on`, `escalates_on`,
`visible_to_roles`, `created_at`, `reviewed_at`, `resolved_at`.

### Future purchases

**`purchase_goals`** — `name`, `vehicle_type`, `custom_type`,
`vehicles_required`, `condition`, `make`, `model`, `model_year`, `color`,
`fuel_type`, `transmission`, `market_country`, `seller`, `intended_route`,
`target_purchase_date`, `expected_arrival_date`, `priority`, `status`, `notes`.

**`planned_vehicles`** — `goal_id`, `sequence`, `stage`, `target_date`,
`purchased_at`, `onboarded_vehicle_id`.

**`acquisition_cost_lines`** — `planned_vehicle_id`, `cost_category`,
`estimated_minor`, `actual_minor`, `ledger_entry_id`.

**`acquisition_payments`** — `planned_vehicle_id`, `payment_type`
(`DEPOSIT | INSTALLMENT | FINAL`), `amount_minor`, `paid_on`, `method`, `paid_to`,
`original_currency`, `original_amount_minor`, `exchange_rate`,
`receipt_document_id`, `ledger_entry_id`, `next_due_on`.

**`savings_targets`** — `goal_id`, `total_budget_minor`, `weekly_target_minor`,
`monthly_target_minor`, `profit_reserve_pct`, `min_operating_cash_minor`,
`min_emergency_reserve_minor`.

**`cash_reservations`** — `goal_id`, `amount_minor`, `reserved_at`,
`released_at`.

**`transit_records`** — `planned_vehicle_id`, `vin`, `engine_number`, `mileage`,
`condition`, `purchase_location`, `export_country`, `export_port`,
`destination_port`, `shipping_company`, `vessel_name`, `bill_of_lading`,
`shipped_on`, `expected_arrival`, `actual_arrival`, `current_location`,
`clearing_agent`.

### Documents

**`documents`** — `owner_type`, `owner_id`, `doc_type`, `storage_key`,
`filename`, `mime_type`, `size_bytes`, `uploaded_by`, `uploaded_at`. Polymorphic,
serving vehicle photos, driver IDs, purchase agreements, bills of lading,
receipts and registration papers.

**Driver ID and licence images are visible to Owner/Admin and Fleet Manager
only.** Collections and Maintenance never see them.

---

## 4. Desktop workspaces

Owner/Admin and Fleet Manager share the same screens; permissions differ.

Navigation: Home, Records, Vehicles, **Drivers**, Maintenance, Accounting,
Future Purchases, Approvals, Payment targets, Export report, Settings.

### Home

Fleet summary counts, quick record-entry entry points, vehicle list, recent
records. **Every card that looks actionable must work** and open a real view —
sprinters, box trucks, vehicles, targets, recorded today, driver payments,
repairs, truck trips, vehicle problems, maintenance records, accounting records,
approvals, alerts. Empty sections still open and show a proper empty state.

### Records

Every submitted payment, income, expense, maintenance event, trip, vehicle
purchase and transaction produces a record.

- Expenses show a minus sign. Income and payments positive.
- Every record clickable → **read-only** detail showing vehicle, driver, dates,
  amount, payment status, remaining balance, maintenance description, parts and
  labour, trip information, notes, who entered it, actual entry/payment date, and
  the date the record applies to.
- No editing here. Corrections go through the authorized workflow with audit
  trail.
- Filters: payments, income, expenses, maintenance, problems reported, repairs,
  breakdowns, Sprinter operations, box-truck trips, vehicle purchases, parts,
  driver balances, other payments.
- Summary cards are clickable and filter the list.

### Vehicles

Opens the **fleet list**, not a registration form.

Header shows a live summary: "6 vehicles — 3 active, 2 grounded, 1 in
maintenance". Each vehicle has a type icon and a status light: green Active, red
Grounded, amber In maintenance. No per-type add buttons.

A large **+ Add Vehicle** button, matching the Driver payment button in weight.
Adding captures type (with custom type and description when Other), purchase
information, commercial purpose, route, color, plate, photo and identifying marks.

Clicking a vehicle opens its profile: internal fleet ID, plate, photo, type,
color and marks, route, driver name and phone, purchase date and price, service
entry date, current status, all payments and income, all expenses, maintenance
history, problems and breakdowns, parts installed, trips, outstanding balances,
profit/loss, total earned, total spent, net contribution, yearly target and
progress, expected retirement date.

Driver-purchase vehicles also show agreement amount, installments paid, remaining
balance, regular payment, expected completion date and ownership-transfer status.

Removed vehicles are **archived**, never deleted.

### Drivers

Everyone who has driven for the business, present and past. This is where money
owed actually lives.

Profile: photo, full name, name commonly used, phone numbers, address, next of
kin, licence number and expiry, ID document type and number, ID photo, licence
photo, date started, date left and reason, status, vehicle currently assigned,
full assignment history, total collected for the business, **current amount owed**,
balance history with causes and clearance dates, driver-purchase agreement,
breakdowns and problems reported while driving, notes.

Clickable cards: Active drivers, Former drivers, Total owed by drivers, Drivers
with overdue balances.

A driver can be added from here or from the Vehicles workspace, and assigned to a
vehicle at either point.

### Maintenance

All cards, records and vehicle entries clickable.

Record types, in this order: **Problem Reported, Regular Service, Repair**.

- **Oil Change appears only under Regular Service.** Problem Reported and Repair
  show the other areas without it.
- Selecting Oil Change auto-sets the work action to Oil Change and offers a filter
  option: new filter installed / existing filter reused / filter not changed.
- Parts: no part needed, new part, used part, existing part repaired.
- Problem Reported labels the work action **Problem Identified** and offers
  structured descriptions by vehicle area: not working, worn, damaged, making
  noise, leaking, weak performance, needs inspection, needs replacement,
  intermittent problem, other.
- Capture: date identified, expected inspection date, expected repair date,
  safety status, whether grounded, notes, reminder date.
- Also capture who handled it — family workshop, approved mechanic, park mechanic,
  other — and whether old parts were returned.
- Authorized users move a vehicle Grounded ↔ Active and Active ↔ In maintenance
  directly.

Dashboard cards, all clickable: Total Records, Vehicles Grounded (with a clear
red/green switch; changing to Active removes it from the list), Recorded Cost
(opening analytics: total spending, parts vs labour, cost by vehicle, cost by
category, most frequently replaced parts, vehicles consuming the most, repeat
repairs — linked to Accounting), Old Parts Not Returned.

### Accounting

Owner/Admin and Fleet Manager. Every summary rectangle clickable.

- **Sprinter Income** — income by Sprinter, comparison across vehicles, highest
  and lowest performers, expected vs collected, missing payments and balances.
- **Truck Income** — income by truck, trip revenue, direct trip costs, net trip
  contribution, comparison between trucks.
- **Known Expenses** — by category, showing where money leaves and what consumes
  the most.

Split the ledger area in two: a smaller recent-transactions section, and a
financial summary separating income and expenses. Also show amounts owed to the
business, amounts owed by it, backdated entries, reconciliation status,
profit/loss, accounting checks, targets, and improvement observations drawn from
recorded data.

Accounting alerts: missed payments, unpaid balances, overdue balances, unusual
expenses, disputed expenses, reconciliation differences, vehicle below target.
Only unusual or disputed expenses require Fleet Manager approval.

### Future Purchases

A planning workspace, fully wired to Accounting, Vehicles, Records, Alerts and
financial targets. The point is to follow one vehicle from savings goal, through
purchase and transit, into the active fleet without losing its history.

**Purchase goals** capture name, vehicle type, number required, new or used, make,
model, year, color, fuel, transmission, market country, seller, intended route,
target purchase date, expected arrival, priority, notes, and supporting documents.

**Landed cost** covers far more than the advertised price. Estimated and actual
for each of: vehicle price, pre-purchase inspection, auction fees, seller or agent
fees, inland transport to port, export documentation, shipping, marine insurance,
port and terminal charges, customs duties, clearing-agent fees, storage or
demurrage, transport from port, registration, plates, roadworthiness inspection,
insurance, initial repairs, spare parts, tyres, battery, oil and fluids, branding
or painting, GPS equipment, other, contingency.

Calculate: estimated price, estimated additional costs, estimated total landed
cost, actual equivalents, variance, and amount over or under budget. Never count
an expense twice if it already came through Accounting.

**Funding** shows current business cash, amount reserved for purchases, amount
available without touching reserved operating money, amount still required,
percentage funded, expected monthly contribution, expected date the target is
reached, whether the planned date is realistic, and the effect on operating cash
and reserves. **Never tell the user a vehicle is affordable based on the total
balance alone.**

**Savings targets:** total budget, target date, weekly and monthly targets,
percentage of profit to reserve, minimum operating cash after purchase, minimum
emergency reserve, number of vehicles. Progress shows amount saved, remaining,
percentage complete, on track or behind, required contribution to catch up, and
estimated completion date. Green on track, amber at risk, red significantly behind
or would breach the reserve.

**Forecasting** from actual accounting data: average monthly income, expenses and
profit, outstanding balances, expected maintenance costs, current savings, monthly
amount available to save, projected purchase date, and best-case, expected and
conservative projections. Explain plainly — "At the present savings rate, this
goal is expected to be fully funded by 15 March 2027."

**Stages**, shown on the purchase card: Idea/considering, Researching, Saving,
Ready to purchase, Seller selected, Deposit paid, Fully purchased, Awaiting
shipment, In transit, Arrived at port, Customs/clearing, Transporting from port,
Inspection and registration, Ready for onboarding, Active/in service, Cancelled.

**Payments** in stages — deposit, installments, final — capturing amount, date,
method, recipient, receipt, currency, exchange rate, SLE equivalent, remaining
owed and next due date. Each creates an Accounting expense and a vehicle-purchase
record, reduces the amount owed, updates the goal, and raises an alert when the
next payment is due.

**Transit tracking** and **document attachment** as per the data model.

**Comparison** across candidate vehicles: price, estimated landed cost, age,
mileage, condition, fuel type, expected repair cost, estimated monthly earning
potential, expected operating expenses, estimated payback period, seller and
location, advantages, risks, notes. Present it clearly; **never auto-select**.

**Cards**, all clickable: Active Purchase Goals, Amount Saved, Amount Still
Required, Vehicles Purchased, Vehicles in Transit, Vehicles at Port, Ready for
Onboarding, Overdue Purchase Actions.

**Onboard Vehicle** appears at Ready for Onboarding and carries across everything
already recorded — type, make, model, year, color, VIN, engine number, plate,
purchase date and price, landed cost, mileage, fuel, transmission, photographs,
documents, registration and insurance, intended route. Only operational details
remain: internal fleet ID, assigned driver and phone, route, expected daily
payment, yearly target, service entry date, initial maintenance schedule, current
status. After onboarding the vehicle joins the active fleet with its full
acquisition history attached, and the goal count updates.

**Capital treatment:** a completed purchase is a business asset, not ordinary
operating expense. Preserve the acquisition breakdown as the vehicle's starting
asset cost, keep daily operating expenses separate, and leave room for
depreciation reporting later.

### Approvals, Payment targets, Export report, Settings

Approvals lists items awaiting decision. Payment targets sets each vehicle's
expected daily amount and yearly target. Export produces a downloadable report.
Settings covers people, roles, PINs and permissions.

---

## 5. Collections & Finance — mobile

Large touch controls. Simple. A data-entry tool, not a dashboard. No alerts bell.

Two sections:

### Sprinter & Box-Truck Payment

Vehicles grouped by type — all Sprinters together, all box trucks together, future
types grouped — rearranging automatically as vehicles are added.

After choosing a vehicle and date, ask **What happened that day?**

| Option | Behaviour |
|---|---|
| **Full Day** | The vehicle worked the whole day, so the full expected amount is due. Default to the expected amount with **Done** in one tap. A small "Paid less than expected" link reveals an amount field; any shortfall goes **automatically to the driver's debt**, whatever the reason. A note may be added but does not cancel the debt. |
| **Half Day** | A known disruption cut the day short and the vehicle worked the rest. Require a cause: breakdown, accident, police or checkpoint issue, other with a note. Ask the amount received. The shortfall is **accepted — no driver debt** — but is recorded against the vehicle's target with its cause. Owner/Admin or Fleet Manager can convert it to driver debt on review. |
| **Driver's Day** | No amount. Owner payment recorded as zero. Reason recorded as Driver's Day. Next becomes **Done**. Monthly; the exact selection rule stays configurable. |
| **Breakdown** | Ask what amount, if any, was received — zero or otherwise. No unpaid balance against the daily target. Allow a note on how long the vehicle worked and what happened. Then Done. |
| **Did Not Work** | No amount. Record zero. No unpaid balance. Next becomes **Done**. |

**The rule that decides everything:** a shortfall becomes driver debt only when
the vehicle worked a full day. Whether the driver has an explanation is not the
test — the test is whether the working day was actually cut short.

An accepted shortfall is still a loss. Nobody owes it, but the money is missing
from the vehicle's target. Record it with its cause so Accounting can show what
breakdowns, accidents and checkpoint problems cost over a year.

The collector cannot forgive a debt. Half Day requires a cause, and management can
convert any accepted shortfall to debt on review.

**Overpayment.** When more than expected is received, the person entering must
choose a reason before saving: settling an earlier shortfall (apply against the
driver's oldest open balance, showing what it clears and what remains), advance on
a future day (hold as credit), or other (requires a note). Never apply an
overpayment silently.

**Several days paid together.** The stepper arrows must increase and decrease the
day count. The end date is calculated from the start date and count — the user
never edits it. Starting the 6th for 10 days works the end date out itself. A late
bundled payment applies each amount to the historical date it was due, keeps the
calendar in chronological order, records the actual date the money arrived, adds a
note that older dates were paid late, and fills the missing daily records without
pretending the money came in on those days.

### Other Payment

No intermediate "Choose Payment" step. Show: amount input, Income / Business
Expense toggle, date, category, note, Done.

---

## 6. Maintenance & Repairs — mobile

Simple, mobile-friendly, no alerts bell, no dashboard.

Structured selections plus typed notes. Give the note field real room — this is
where the person who saw the problem describes it, and a cramped single-line input
will get one-word answers.

**No audio recording, playback or transcription.** Text notes only.

Only maintenance, problems, repairs, parts and vehicle-status tools are visible.

---

## 7. Alerts

- Tapping a notification opens the **exact** record — the specific maintenance
  order, balance or purchase goal. Never a general list page.
- Yellow for new. Red for overdue or urgent. The bell interior illuminates in the
  matching colour. Severity becomes more noticeable as an alert ages.
- The count updates when alerts are reviewed or resolved.
- A grounded vehicle: capture expected completion date or estimated grounded days,
  clear the current alert once reviewed, create a new reminder as the date
  approaches, ask for confirmation that the vehicle has returned to service, and
  keep the order open until completed and approved.
- On completion: vehicle to Active, order closed, alert cleared, order preserved
  in history.

Alert types: maintenance due and overdue, vehicle grounded, balance outstanding,
missed payment, unusual or disputed expense, reconciliation difference, vehicle
below target, savings behind, purchase date approaching without funds, deposit or
installment due, shipping departure, expected port arrival, arrival delay, customs
deadline, demurrage risk, registration due, insurance due, missing documents,
vehicle ready for onboarding.

---

## 8. Offline behaviour

The mobile workspaces must work with no signal.

- Local write queue on the device, flushed when connectivity returns.
- `client_record_id` on every insertable row so retries are idempotent.
- The device shows what is still pending sync.
- Two collectors recording the same vehicle-day is caught by the unique index and
  becomes a flagged duplicate for review, never a silent overwrite.

---

## 9. Build order

1. **Foundation** — repo, stack, database schema, migrations, seed data.
2. **Auth and permissions** — email/password for desktop, PIN for mobile, enforced
   server-side.
3. **Vehicles and Drivers** — the two subject tables everything else references.
4. **Records spine** — ledger, activity records, corrections, audit log, the
   clickable read-only detail view.
5. **Daily payments** — the five outcomes, shortfall treatment, overpayment,
   bundled days, balances.
6. **Maintenance** — orders, statuses, parts, status events.
7. **Alerts** — with working deep links.
8. **Accounting** — clickable cards and analytics.
9. **Offline sync** — queue, idempotency, pending indicators.
10. **Future Purchases** — goals, landed cost, funding, stages, transit,
    onboarding.
11. **Export, settings, polish.**

Each phase ends with something usable. Do not start the next until the current one
runs.

---

## 10. Open questions

To be answered before the phases that depend on them:

1. Box trucks — paid per trip or per day? What is captured per trip: revenue,
   fuel, checkpoint costs, driver and helper pay?
2. Rent-to-own vehicles — is the installment separate from the daily payment, or
   does the daily payment count toward the purchase?
3. Which currencies are actually paid in for imported vehicles?
4. Yearly targets — calendar year? Set per vehicle by the Owner?
5. How bad is connectivity where the collectors work — occasional drops, or hours
   offline daily?
6. Should breakdown simply be a cause under Half Day, with the separate Breakdown
   option reserved for a vehicle that never worked at all?
7. Can a driver's accumulated debt be forgiven, and does that need Owner approval
   and a recorded reason?
