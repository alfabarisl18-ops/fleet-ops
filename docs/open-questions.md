# Open questions

Two lists. The first is SPEC section 10, unchanged. The second is what Phase 1
had to assume because SPEC did not say, recorded here so the guesses are visible
rather than buried in a migration.

---

## From SPEC section 10

These need answering before the phases that depend on them.

| # | Question | Blocks |
|---|---|---|
| ~~1~~ | ~~Box trucks — paid per trip or per day? What is captured per trip: revenue, fuel, checkpoint costs, driver and helper pay?~~ **Resolved in SPEC.md itself** ("Resolved (was open question 1): box trucks are paid per trip, not per day"), before Phase 5 was built. This table just hadn't been updated to match. | Phase 5, Phase 8 |
| ~~2~~ | ~~Rent-to-own vehicles — is the installment separate from the daily payment, or does the daily payment count toward the purchase?~~ **Resolved** — see [decision 0018](decisions/0018-rent-to-own-installment-is-the-daily-target.md). | Phase 5 |
| ~~3~~ | ~~Which currencies are actually paid in for imported vehicles?~~ **Moot by design** — `acquisition_payments.original_currency` is free-form (any ISO-4217-shaped 3-letter code, not a fixed enum), so the schema never needed a specific list to function. Built in Phase 3 (`20260808232635_acquisitions.sql`); not revisited since. | Phase 10 |
| ~~4~~ | ~~Yearly targets — calendar year? Set per vehicle by the Owner?~~ **Resolved** — calendar year (Jan 1–Dec 31), see [decision 0013](decisions/0013-accounting-scope-and-trips-mobile-correction.md). Re-confirmed directly with the user in 2026-08 that either desktop role (not Owner-exclusive) should be able to set it — matches `TargetPanel`'s existing behavior, no code change needed. | Phase 8 |
| ~~5~~ | ~~How bad is connectivity where the collectors work — occasional drops, or hours offline daily?~~ **Moot by design** — Phase 9's offline queue was built for the worst case regardless of the answer (retry, idempotency via `client_record_id`, a pending-sync indicator); see [decision 0014](decisions/0014-offline-queue-pwa-and-a-new-table-after-guards.md). The actual severity was never needed to size the design. | Phase 9 |
| ~~6~~ | ~~Should breakdown simply be a cause under Half Day, with the separate Breakdown option reserved for a vehicle that never worked at all?~~ **Resolved — leave as-is.** Confirmed directly with the user in 2026-08: no change. Both options have shipped and been in real use since Phase 1 with no reported confusion. See [decision 0019](decisions/0019-breakdown-and-half-day-stay-separate.md). | Phase 5 |
| ~~7~~ | ~~Can a driver's accumulated debt be forgiven, and does that need Owner approval and a recorded reason?~~ **Resolved** — see [decision 0017](decisions/0017-debt-forgiveness-owner-only-reason-required.md). | Phase 5 |

**All seven of SPEC section 10's questions are resolved as of 2026-08-18.**
Three were closed by asking the user directly this session (2, 6, 7); two were
already answered elsewhere and just never marked here (1 in SPEC.md itself, 4
in decision 0013); two turned out not to need a specific answer at all,
because the schema and the offline queue were both built generically enough
to not depend on one (3, 5).

---

## Assumed during Phase 1

Each of these was a place SPEC named a field but not its values, or named a
capability but not who holds it. The assumption is stated so it can be corrected
cheaply now rather than expensively later.

| Assumption | Where | How hard to change |
|---|---|---|
| Fleet Manager can read `users` but not create or edit accounts. SPEC gives Owner/Admin "manages people, roles, PINs, permissions" and says Fleet Manager cannot create administrators or control system security; it is silent on ordinary accounts, so deny-by-default applies. | `users_insert_owner`, `users_update_owner` | One policy |
| `maintenance_orders.safety_status` values are `ROADWORTHY / LIMITED_USE / NOT_ROADWORTHY / UNKNOWN`. SPEC names the field but not its values. Enum named `roadworthiness` to keep the word "safe" away from anything that could be mistaken for a vehicle status. | `public.roadworthiness` | Enum change, no data yet |
| `service_area` and `work_action` are `text`, not enums. SPEC gives the vehicle areas only by example. `OIL_CHANGE` is the one value the database constrains, because SPEC states its rule outright. | `maintenance_orders` | Adding an enum later is a migration |
| `purchase_priority` is `LOW / MEDIUM / HIGH` and `purchase_goal_status` is `ACTIVE / ON_HOLD / ACHIEVED / CANCELLED`. SPEC names both fields, neither value set. | `public.purchase_priority`, `public.purchase_goal_status` | Enum change, no data yet |
| Collections & Finance may record expenses in every category, including parts and labour. Maintenance & Repairs may record expenses only in `PARTS`, `LABOUR` and `MAINTENANCE`, and no income at all. SPEC says "records payments, income and expenses" and "records problems, repairs, parts and vehicle status" respectively. | `ledger_insert_collections`, `ledger_insert_maintenance` | One policy each |
| Any signed-in role may *request* a correction; only the desktop roles decide one. SPEC says corrections go through the authorised workflow but not who may open one. | `corrections_insert_signed_in` | One policy |
| Reserving business cash against a purchase goal is Owner-only, since it directly reduces what the operation can spend. SPEC does not split Future Purchases by role beyond "desktop". | `cash_reservations_insert` | One policy |
| Nothing is ever deleted. There is no `DELETE` policy on any table in the database. Vehicles and drivers are archived or retired by status, money rows are superseded. | every table | Adding one would be deliberate |
| A shortfall is recorded for Driver's Day and Did Not Work too, treated as `ACCEPTED_LOSS`. The vehicle's target went unmet, and `day_outcome` sits on the row so Accounting can separate a scheduled Driver's Day from a breakdown. | `daily_payment_records` | Generated column change, table rewrite |

---

## Not a question — a constraint worth restating

Business dates are Freetown dates, computed on the server. The team is split
across Freetown, the United States and China, so "today" differs by person at the
same moment. Every business date column defaults to `app.freetown_today()` and a
trigger rejects anything after it. There is no client-side helper that turns a
device clock into a business date, and an ESLint rule blocks bare `new Date()`.
