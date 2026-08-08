# Open questions

Two lists. The first is SPEC section 10, unchanged. The second is what Phase 1
had to assume because SPEC did not say, recorded here so the guesses are visible
rather than buried in a migration.

---

## From SPEC section 10

These need answering before the phases that depend on them.

| # | Question | Blocks |
|---|---|---|
| 1 | Box trucks — paid per trip or per day? What is captured per trip: revenue, fuel, checkpoint costs, driver and helper pay? | Phase 5, Phase 8 |
| 2 | Rent-to-own vehicles — is the installment separate from the daily payment, or does the daily payment count toward the purchase? | Phase 5 |
| 3 | Which currencies are actually paid in for imported vehicles? | Phase 10 |
| 4 | Yearly targets — calendar year? Set per vehicle by the Owner? | Phase 8 |
| 5 | How bad is connectivity where the collectors work — occasional drops, or hours offline daily? | Phase 9 |
| 6 | Should breakdown simply be a cause under Half Day, with the separate Breakdown option reserved for a vehicle that never worked at all? | Phase 5 |
| 7 | Can a driver's accumulated debt be forgiven, and does that need Owner approval and a recorded reason? | Phase 5 |

**Question 1 already bites.** `TRK-01` is seeded with
`expected_daily_amount_minor = 0`, because a daily target for a vehicle paid per
trip is meaningless. Zero means "no daily target set", not "expects nothing" — a
daily payment record against it would compute a full shortfall. No daily records
should be entered for box trucks until this is settled.

**Question 7 is partly answered by the schema already.** `outstanding_balances`
has a `WRITTEN_OFF` status, and only the desktop roles can update a balance. So
forgiveness is possible and is management-only. Whether it additionally needs
Owner approval and a recorded reason is still open.

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
