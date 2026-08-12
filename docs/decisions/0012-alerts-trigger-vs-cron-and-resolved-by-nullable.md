# 0012 — Alerts: trigger vs. cron per type, resolved_by becomes nullable

**Decided:** 2026-08-13 · **Status:** accepted

Phase 1 built the full alerts schema (`public.alerts`, `alert_type`,
`alert_severity`, RLS, `alerts_one_live_per_subject`) with nothing ever
writing to it. SPEC names 21 alert types; 16 belong to subsystems that
don't exist yet (Accounting — Phase 8; Future Purchases — Phase 10).
This phase wires the 4 raisable from what's already built and gives the
rest labels only, same deferral pattern as every prior phase.

**Trigger vs. cron, decided per type, not uniformly.** `VEHICLE_GROUNDED`
and `BALANCE_OUTSTANDING` each have one event that causes them (a status
flip, a balance opening/closing) — plain `AFTER` triggers, immediate.
`MAINTENANCE_DUE`, `MAINTENANCE_OVERDUE`, and `MISSED_PAYMENT` are
genuinely date-driven — nothing is inserted when a reminder date arrives
or a day passes with no payment — so they need something to periodically
re-check. Confirmed with the user: `pg_cron`, daily, at 06:00 GMT (=
Freetown local, no DST). Both mechanisms write through the same
`alerts_one_live_per_subject` idempotency guard.

**`alerts_resolved_pair` (Phase 1) required `resolved_by` whenever
`resolved_at` was set** — correct for a person resolving an alert by
hand, wrong once resolution can also happen automatically (the daily job
resolving a `MISSED_PAYMENT` once a late record appears, or an order
closing). Replaced with `alerts_resolved_by_implies_resolved_at`
(`resolved_by is null or resolved_at is not null`) — same category of
fix as decision 0010's append-only bug: a real Phase 1 gap, fixed at the
root, not worked around with a fabricated "System" user account (which
would have required a schema change to `user_role` and risked leaking
into every `entered_by`/`opened_by` picker across the app).

**`reviewed_at` is server-stamped, not client `new Date()`** — the same
rule as every other event-time column in this app
(`SERVER_STAMPED_COLUMNS` in `src/types/db.ts` already lists five of
these). No prior column needed this via `UPDATE` rather than `INSERT`,
so a small `BEFORE UPDATE` trigger fills it in the first time
`reviewed_by` goes from null to set; the client only ever sends
`reviewed_by`. Caught by the project's own `no-restricted-syntax` ESLint
rule, not manual review — the rule is doing its job.

**Deep-link subject mapping** follows SPEC's own phrasing for what "the
exact record" means — "the specific maintenance order, balance, or
purchase goal": `MAINTENANCE_DUE`/`MAINTENANCE_OVERDUE`/`VEHICLE_GROUNDED`
→ the maintenance order; `BALANCE_OUTSTANDING` → the driver profile
(no standalone balance screen exists) with a new `highlightBalanceId`
prop that scrolls to and highlights the row; `MISSED_PAYMENT` → the
vehicle itself (no payment record exists yet to link to).

**A one-time backfill runs at the end of the migration.** The two
triggers only fire on a *change* — SPR-01's maintenance order was
already grounded from Phase 6 live testing before this migration ran, so
without a backfill it would have silently never gotten an alert. The
migration also invokes `app.evaluate_scheduled_alerts()` once
immediately rather than waiting for the first 06:00 run, so real data
(three vehicles with no payment recorded for the prior day, discovered
by this exact backfill) shows up the moment the migration applies.

**Testing-technique finding, not a schema bug:** simulating a second
role via `set_config('request.jwt.claims', ..., true)` silently no-ops
once the session has already run `set local role authenticated` —
Supabase specifically prevents an already-`authenticated` connection
from rewriting its own JWT claims (the correct security boundary; an
authenticated session must not be able to self-escalate). Every prior
phase's SQL verification only ever switched roles once per transaction,
which is why this hadn't surfaced before. Fix: `reset role;` back to the
elevated connection role before each subsequent `set_config` call within
the same test transaction.

**Revisit this when:** Phase 8/10 build the remaining 16 alert types'
generation logic — the trigger-vs-cron question should be asked fresh
for each one, not assumed to be "cron by default" just because this
phase used it for three of four.
