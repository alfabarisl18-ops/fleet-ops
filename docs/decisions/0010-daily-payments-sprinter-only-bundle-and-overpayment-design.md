# 0010 — Daily payments: Sprinter-only, the bundle split, and the overpayment cascade

**Decided:** 2026-08-12 · **Status:** accepted

Phase 1 built `daily_payment_records`, `bundled_payments`,
`outstanding_balances`, `balance_settlements`, and `driver_credits` with
the five-outcome rule enforced by `GENERATED ALWAYS` columns
(`shortfall_treatment`, `shortfall_amount_minor`) so it can't be gotten
wrong by application code. Nothing had ever written to them until this
phase.

**Scope, confirmed with the user:**

- **Sprinter-only.** SPEC's mobile section is titled "Sprinter & Box-Truck
  Payment," but box trucks are paid per trip (`trips` table), not per day
  (`day_outcome` has no meaning for them). This phase's "Vehicle Payment"
  screen deliberately doesn't use SPEC's literal title — it excludes
  `BOX_TRUCK` and doesn't claim to support it. Trip-payment recording is a
  focused follow-up.
- **No debt forgiveness / write-off.** SPEC lists it as an explicitly open
  question (Owner approval? a recorded reason?). `outstanding_balances`
  already has a `WRITTEN_OFF` status in the schema; nothing in this phase
  builds a way to reach it.

**Bundle distribution.** A bundled payment is modeled as "N regular full
days, paid together" — `record_bundled_payment()` always creates
`FULL_DAY` rows, splitting the total evenly across days (remainder cents
on the last day). SPEC describes bundling as one total amount over a date
range, not a day-by-day outcome picker, so this is the plain reading, not
an invented rule. **Overpayment inside a bundle isn't handled** — SPEC
describes overpayment in the context of entering one payment, not a
multi-day catch-up; if a bundle's total happens to exceed what the days
call for, the excess isn't specially routed anywhere this phase.

**Overpayment settlement cascades across balances.** SPEC says apply
against "the driver's oldest open balance" (singular), but
`record_daily_payment()` walks every open balance oldest-first until the
overpayment is exhausted, rather than stopping after one. Reasoning: SPEC
also says "showing what it clears and what remains" — for an overpayment
larger than the oldest balance, stopping after one balance would leave
real money unaccounted for. Cascading is the more responsible reading,
not a departure from SPEC's intent.

**Driver-purchase installment re-categorization is included here**,
though it wasn't written into the original Phase 5 plan text — it's the
exact deferral the user named explicitly when Phase 3 built
`driver_purchase_agreements` ("the re-categorization... is Phase 5's
job"). `apply_daily_payment_effects()` checks for an open agreement
(`ownership_transfer_status <> 'CANCELLED'`, matching
`fetchOpenAgreementForVehicle`'s own definition) on the vehicle and uses
`DRIVER_PURCHASE_INSTALLMENT` instead of `DAILY_VEHICLE_PAYMENT` when one
exists.

**Two real, pre-existing bugs found while verifying this against the
hosted project, both fixed at the root:**

1. `app.enforce_append_only()` (Phase 1) compared `OLD`/`NEW` for every
   column, including `GENERATED ALWAYS` ones — but Postgres recomputes
   generated columns *after* `BEFORE` triggers run, so `NEW`'s value
   inside the trigger doesn't yet reflect what it will actually be. This
   produced a false "changed" positive on *any* update to
   `daily_payment_records` (the first table with both a generated column
   and a partial mutable-columns allow-list), even to an explicitly
   allow-listed column. Fixed by excluding generated columns from the
   comparison entirely — they can never be directly set by a client
   anyway, so nothing is lost.
2. `apply_daily_payment_effects()`'s `ledger_entry_id` link-back silently
   affected zero rows when called by Collections & Finance, because
   `dpr_update_desktop` only lets desktop roles `UPDATE
   daily_payment_records`. The underlying `ledger_entries` row was still
   created correctly (proven live, not assumed) — only the convenient
   back-reference was missing, silently, with no error. Made the function
   `SECURITY DEFINER`: the row was already authorized at `INSERT` time by
   RLS; this only finishes bookkeeping the inserting role is entitled to
   have happen, the same reasoning `vehicle_status_event_after()` already
   uses for Maintenance & Repairs.

**Revisit this when:** box-truck trip payments or debt write-off get a
real answer to their open questions — see the Phase 5 plan for what those
follow-ups need. Bundle overpayment could be revisited if a real
collector workflow needs a lump sum larger than what the days call for.
