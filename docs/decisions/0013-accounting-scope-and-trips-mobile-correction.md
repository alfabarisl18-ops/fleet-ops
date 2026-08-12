# 0013 — Accounting: scope, and correcting the Trips mobile-entry mistake

**Decided:** 2026-08-14 · **Status:** accepted

Phase 1 built `ledger_entries` with everything this phase needs already
in place (`reconciled_at`/`reconciled_by`, `approval_status`, category,
direction, `superseded_by_id`) — nothing in `src/` had ever aggregated
it; every prior phase only wrote individual rows. This phase is the
first read/reporting layer over data four phases have already produced.

**Three scope decisions, confirmed with the user:**

- **Yearly targets track the calendar year** (Jan 1–Dec 31), not a
  rolling window from `entered_service_on`.
- **Box-truck trip recording gets built now**, closing the Phase 5
  deferral — without it, "Truck Income" (one of SPEC's three named
  cards) would be permanently empty.
- **A desktop reviewer flags an expense unusual/disputed after entry**,
  on the transactions view — not the person who recorded it. No new
  reason-text column was added for the flag itself; SPEC doesn't call
  for one here the way corrections require a `reason`. A stated
  limitation, revisit if real usage wants one.

**Also scoped in**, because Accounting's own cards depend on them: a
**Payment Targets** edit (`yearly_target_minor` had no edit path at all
— excluded from the vehicle correction allow-list, decision 0009 — so
it's a small inline field on `VehicleProfileScreen`, not a new screen)
and a minimal **Approvals** queue. **Out of scope**: Export report and
Settings — SPEC's own build order puts those in Phase 11.

**`RECONCILIATION_DIFFERENCE` is deliberately not built.**
`reconciled_at`/`reconciled_by` are a manual review checkbox — there is
no bank feed or external statement anywhere in this app to compute an
actual *difference* against. `VEHICLE_BELOW_TARGET`, `UNUSUAL_EXPENSE`,
and `DISPUTED_EXPENSE` all have a real, SPEC-given signal and were
built; this one would have needed an invented heuristic.

## A real mistake caught during implementation, not before

The original plan assumed `record_trip` was a **desktop** RPC and wrote
`RecordTripForm` for `DesktopWorkspace`, using column names
(`origin`/`destination`/`cargo`) from the *original* Phase 1 `trips`
migration. Applying the migration failed outright against the live
schema: a later Phase 1 follow-up
(`20260809091500_trips_match_resolved_spec.sql`) had already rewritten
SPEC's Trips section and the table to match — trip entry is a **mobile
Collections & Finance screen**, "under Sprinter & Box-Truck Payment →
box truck selected," and the columns are
`pickup_location`/`destination_location` (no `cargo`, folded into
`notes`), plus `load_quantity`/`load_weight`/`load_weight_unit`.

Caught immediately (the migration simply doesn't apply against the
wrong column names), fixed before any further work: `record_trip`
rebuilt with the real columns and made callable by both desktop and
Collections & Finance (both already have the necessary grants —
`trips_insert_desktop_or_collections`, `ledger_insert_collections`/
`desktop` — no RLS mismatch either way); `RecordTripForm` rebuilt as a
mobile screen reached from `VehiclePaymentScreen`'s existing vehicle
picker, which now includes box trucks and branches straight to trip
entry instead of the day-outcome flow when one is picked. Verified live
through the real PIN-authenticated Collections & Finance path, not
simulated claims — this is exactly the class of check decision 0011
flagged as impossible to prove via `set_config`-simulated JWTs; this
time it was proven for real.

**The lesson, not just the fix:** re-reading the *current* file on disk
before designing against it would have caught this before writing any
code. The original Phase 1 exploration (this session, several phases
ago) quoted the trips table as it existed *then*; a follow-up migration
changed it three days later in the same phase, and nothing re-checked.

## `evaluate_scheduled_alerts()` and `reconciled_at`: two more small bugs

Same shape as Phase 6 and 7's own `CASE`-cast findings: a `CASE`
expression inside `record_trip`'s `INSERT` needed an explicit
`::trip_status` cast (Postgres doesn't infer it the way a plain
`VALUES` insert does). And `reconciled_at` turned out to need the exact
same server-stamp trigger `alerts.reviewed_at` got in Phase 7 — caught
by this project's own `no-restricted-syntax` ESLint rule before it ever
reached the database, not after.

**Revisit this when:** real usage shows a flagged expense needs a
recorded reason; Phase 10 (Future Purchases) needs its own read of
`ledger_entries` for landed cost and forecasting, at which point the
query patterns here (`fetchLedgerSummary`, category grouping,
year-to-date sums) are the ones to reuse, not reinvent.
