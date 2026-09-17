# Assignment, purchase schedule, and Service rollout

**Status: deployed to staging on 16 September 2026 and production on 17 September 2026.**

All five migrations below were applied only to staging Supabase
`netxgjqeaakbkjqvtdhl`. Cloudflare deployed application commit
`a5543ecca8878ff62a51a768884b9757601d78c3` from `codex/staging` to
`https://fleet-ops-staging.pages.dev`. The live project still deploys `main` at
commit `3778a01efdbd453ddb97f0b565e52c4ef3253f38` and automatic previews remain
disabled.

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

The staging migration list, enum values, columns, RPC security settings and grants
were verified after execution. No open purchase agreements existed, so the rollout
did not backfill any existing open agreement. Generated staging types were compared
with the application types. The Pages projects were also rechecked: live `fleet-ops`
remains main-only with automatic previews disabled; staging uses `codex/staging`,
with staging database settings for both its primary deployment and previews. Old
live-project previews remain unsafe.

After staging acceptance, the owner approved the same five migrations for production
Supabase `hjebavtcdduortshufku` and approved the application release. Supabase
recorded versions `20260917053232`, `20260917053311`, `20260917053329`,
`20260917053349`, and `20260917053406`. Cloudflare production deployment
`80760b3e-ce45-4464-b939-15e80cf93c6e` successfully built commit
`68eb2c7e87d1749ba12ee69c868a01fd394bfb84` from `main`. The live project remains
main-only with automatic previews disabled, and its production and preview settings
both point to production Supabase. Never copy staging data to production. The local
`.env.local` targets staging; type generation also defaults to staging. CLI SQL
remains approval-gated regardless of branch or local environment.

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
- Cloudflare deployed the intended staging commit successfully. A deployed browser
  smoke test loaded the role and shortcut screens, exercised the rejected-password
  path, and confirmed every Supabase request used staging project
  `netxgjqeaakbkjqvtdhl`; no request used production. A successful authenticated
  session and hands-on hosted writes remain to be tested because no staging QA
  credential is stored in the repository or local environment.

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
