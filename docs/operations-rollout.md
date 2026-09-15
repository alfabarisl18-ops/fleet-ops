# Assignment, purchase schedule, and Service rollout

**Status: local implementation; hosted SQL and deployment are not approved yet.**

## Exact SQL to review

Target first: **staging Supabase `netxgjqeaakbkjqvtdhl`**.
Do not execute against production `hjebavtcdduortshufku`.
Run each migration separately, in this order. Enum additions must commit before
later migrations use their values. Do not paste all five into one transaction.

1. [Assignment route transaction](../supabase/migrations/20260907170000_assignment_route.sql)
2. [Purchase policy enum additions](../supabase/migrations/20260907171000_purchase_policy_enums.sql)
3. [Purchase schedule, allocation, permissions and corrections](../supabase/migrations/20260907172000_purchase_schedule.sql)
4. [Service enum addition](../supabase/migrations/20260907173000_service_enum.sql)
5. [Service constraints and activity descriptions](../supabase/migrations/20260907174000_service_days.sql)

The files above are the exact proposed SQL. No seeds, data copying, or resets.
Existing open agreements get activation dates, fixed rates and baselines; existing
payment/ledger/debt amounts stay unchanged. New columns and generated treatment
rebuild can briefly lock their tables, so use a quiet period. Invalid existing
installment rates fail safely rather than silently inventing a usable rate.

After staging SQL approval: verify the migration list and actual policy dates,
regenerate types with `npm run db:types` (staging), push only `codex/staging` to the
staging Cloudflare project, verify the intended commit, and test with staging
accounts. Recheck Pages projects: live `fleet-ops` remains main-only with automatic
previews disabled; staging uses `codex/staging`, with staging database settings for
both its primary deployment and previews. Old live-project previews remain unsafe.

Production needs a separate SQL and release approval after staging passes. Its
activation date will be its own Freetown migration date, not the staging date.
Never copy staging data to production. The local `.env.local` now targets staging;
type generation also defaults to staging. CLI SQL remains approval-gated regardless
of branch or local environment.

## Validation

- `node tools/test-database.cjs`: isolated PostgreSQL, all repository migrations;
  real RLS/helper policies with platform auth/storage/cron scaffolding. Tests route
  changes/None/transfers/retries, historical upgrade preservation, all ordinary
  outcomes, purchase deferrals, missing days, fractions, late bundles, extras,
  held advances, unrelated debt settlement, corrections, closure and payoff,
  Service zero enforcement, and role boundaries.
- `node tools/browser-check.cjs`: local Vite harness, every external call mocked;
  Service at 320/375/768/1024/1440px, keyboard Done, zero payload, IndexedDB offline
  queue/replay. Also exercises both assignment forms, route defaults, changes/None,
  stable retry IDs, refreshed vehicle information and purchase progress.
- Required application checks: `npm run typecheck`, `npm run lint`, `npm run test`,
  `npm run build`. Final run outcomes are recorded in docs/log.md.
- Hosted staging sign-in, actual database writes and deployed commit verification
  remain pending approval; mock browser tests do not establish hosted behavior.

The database harness needs a temporary test-only runtime, not a project dependency:

```powershell
$testRuntime = Join-Path $env:TEMP 'fleet-ops-db-test-runtime'
npm install --prefix $testRuntime --no-audit --no-fund --package-lock=false @electric-sql/pglite
node tools/test-database.cjs
```

`FLEET_PGLITE_MODULE` may name an alternative installed module. The browser harness
uses the bundled Playwright runtime or `FLEET_PLAYWRIGHT_MODULE`. Start Vite on
127.0.0.1:5179 with the staging URL and a dummy publishable key; the harness must
intercept all nonlocal requests. `FLEET_BROWSER_SCREENSHOT` optionally saves a
screenshot to an absolute path. The harness HTML is not part of the built app.

## Known boundaries

No new production dependency or recurring service. Purchase correction applies
to new-policy pure installment amounts; it deliberately refuses mixed-purpose
credit/debt allocations and historical-policy payments. Those separate financial
histories require their own review rather than silent reversal. Newly received
late money is recorded as a payment, not a correction to an old receipt date.

## Sources

SRC-OPERATIONS-20260907-USER, SRC-OPERATIONS-20260907-REPO and
SRC-PGLITE-20260907 in sources.md. Purchase implementation checkpoint 943d637;
route checkpoint 6a35c2c; current migration/test files are the proposed release.
