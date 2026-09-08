# 0026 — Purchase installments defer instead of creating new debt

User decision, 2026-09-07 (SRC-OPERATIONS-20260907-USER): apply the new rule
from the policy activation date, preserving older payment and debt facts.
A server snapshot selects the agreement for the service date, using Freetown.
The fixed daily equivalent uses existing integer Daily / Weekly ÷ 7 / Monthly
÷ days-in-start-month conventions. Terms and original completion date stay fixed.

The server counts elapsed scheduled days, including today only after a daily
entry exists, and subtracts allocated purchase payments. It divides the cumulative
minor-unit difference by the fixed rate and rounds upward once. Missing entries
are projections, not synthetic debt. Explicit extra purchase payments count in
full; other overpayments count at most the installment, with old agreement debt
settlements counted separately once. Historical untagged installments retain their
previous allocation. Missing-entry reminders remain distinct from debt alerts.

An agreement without an original end date estimates its baseline from remaining
principal at activation; a new agreement uses its initial principal. Closing an
agreement stores its progress to stop date movement. Zero balance displays Paid
in full; management still controls ownership transfer and archiving.

Owner/Admin can correct new-policy installment amounts through an append-only
replacement and correction audit. Zero replacement entries mean an approved
correction to zero, not a cash movement. Credits, debt settlements, and other
mixed-purpose allocations cannot be silently changed with that action; their
separate financial histories require separate review. Historical corrections
remain outside this new-policy operation. Original daily entries stay visible.

No hosted migration has been applied. Local test scaffolding runs the repository
migrations against isolated PostgreSQL, with Supabase auth/storage/cron simulated.
Run `node tools/test-database.cjs`; `--generate-types` generates additive schema
changes from that catalog. Full Supabase type generation follows staged rollout.

## Sources

- SRC-OPERATIONS-20260907-USER, docs/sources.md: approved product rules.
- SRC-OPERATIONS-20260907-REPO: existing payment and ledger design, snapshot 94fe6e6.
- SRC-PGLITE-20260907: local test engine documentation.
- Implementation: migrations 20260907171000 and 20260907172000, and tools/database-tests.sql.
