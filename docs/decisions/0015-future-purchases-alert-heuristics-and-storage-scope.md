# 0015 — Future Purchases: invented alert thresholds, Storage scope, and a live PostgREST embed bug

**Decided:** 2026-08-16 · **Status:** accepted

Phase 1 built the entire schema this phase needed — `purchase_goals`,
`planned_vehicles`, `acquisition_cost_lines`, `acquisition_payments`,
`savings_targets`, `cash_reservations`, `transit_records`, plus the
polymorphic `documents` table — already RLS'd to desktop only. Nothing in
`src/` had ever written to any of them. This phase added two RPCs
(`record_acquisition_payment`, `onboard_vehicle`), one new invariant
(`pv_active_in_service_is_onboarded`), and wired all 12 remaining alert
types `alerts_generation.sql`'s own comment had named this phase for.

**Confirmed with the user:** build real Supabase Storage upload for
documents in this phase (a private bucket + desktop-only policies), not
just the metadata screens — the first real file upload anywhere in the app.

## Every alert threshold is a stated default, not a SPEC number

SPEC names all 12 alert types but gives no numeric trigger condition for
most of them. Each was interpreted from the schema and documented in the
migration itself, matching the precedent `MAINTENANCE_DUE`'s 3-day window
already set (decision 0012). Flagged here together so they're easy to
retune in one place:

| Type | Condition | Threshold |
|---|---|---|
| `PURCHASE_DATE_WITHOUT_FUNDS` | target date approaching, reserved cash short of budget | 14 days |
| `SAVINGS_BEHIND` | linear pace vs. actual reserved, short by more than one month's target | 1× `monthly_target_minor` (or 10% of budget if unset) |
| `DEPOSIT_OR_INSTALLMENT_DUE` | most recent payment's `next_due_on` approaching | 3 days |
| `EXPECTED_PORT_ARRIVAL` | expected arrival approaching, not yet arrived | 5 days |
| `ARRIVAL_DELAY` | expected arrival passed, not yet arrived | — (immediate, `OVERDUE`) |
| `CUSTOMS_DEADLINE` | days sitting at Arrived at port / Customs clearing | 7 days |
| `DEMURRAGE_RISK` | same, longer | 14 days (`OVERDUE`) |
| `REGISTRATION_DUE` / `INSURANCE_DUE` | at or past Inspection and registration, no *actual* cost recorded for that category | — |
| `MISSING_DOCUMENTS` | Ready for onboarding, zero documents attached at all | — (a simplification: SPEC doesn't enumerate which document types are mandatory) |
| `VEHICLE_READY_FOR_ONBOARDING` | stage reaches Ready for onboarding | event-driven, not cron |
| `SHIPPING_DEPARTURE` | `shipped_on` newly set | event-driven, **no auto-resolve** — it's a one-time fact, not a condition that clears |

## Storage is scoped to this phase's actual need, not the pre-existing gap

The `documents` bucket's RLS policies are desktop-only, mirroring the
`documents` table's own desktop policies but *not* its mobile ones.
Maintenance & Repairs and Collections & Finance have had a documents-table
RLS grant since Phase 1 with no working upload path — building a
`doc_type`-aware mobile storage policy to close that is a different,
pre-existing gap from Phase 5/6, not this phase's to fix. Stated limitation,
not silently dropped.

## `vehicles` gets no new columns

`onboard_vehicle()` carries over exactly what SPEC calls "operational" —
fleet ID, plate, driver, route, targets, service date, status. Make, model,
VIN, engine number, mileage, fuel, transmission, and condition stay on
`purchase_goals`/`planned_vehicles`/`transit_records` permanently, as the
vehicle's "full acquisition history attached" (SPEC's own phrase) —
duplicating them onto `vehicles` would violate the no-duplicate-source-of-
truth rule and go stale the moment anything changed. `purchase_price_minor`
is the summed *actual* landed cost, not the estimate — structural rule 6's
whole point.

## A live bug: PostgREST's to-one embed is an object, not an array

`fetchFuturePurchasesSummary()` and `fetchPurchaseGoals()` both embedded
`savings_targets(total_budget_minor)` inside a `purchase_goals` select and
read it as `(g.savings_targets ?? [])[0]?.total_budget_minor` — the same
shape `cash_reservations(...)` uses in the same query. It silently returned
`undefined` every time. Root cause, confirmed live: `savings_targets.goal_id`
is `unique` (Phase 1), so PostgREST embeds it as a single object (or `null`),
not an array — unlike `cash_reservations.goal_id`, which has no unique
constraint and does come back as an array. "Amount Still Required" showed
`SLE 0` for a real goal with a real SLE 50,000 budget until this was caught
by comparing the Home card against the goal detail screen's own (correct,
separately-queried) figure. Fixed by reading the embed as a nullable single
object; the fix was verified live, re-showing the correct amount.
`PurchaseGoalDetailScreen` was never affected — it queries `savings_targets`
directly with `.maybeSingle()`, not through an embed.

**Revisit this when:** a real numeric trigger condition for
`SAVINGS_BEHIND`/`PURCHASE_DATE_WITHOUT_FUNDS`/`CUSTOMS_DEADLINE`/
`DEMURRAGE_RISK`/`REGISTRATION_DUE`/`INSURANCE_DUE` is decided rather than
inferred from the schema; or if a future phase needs another to-one embed —
check the referenced column's uniqueness first, don't assume array shape.
