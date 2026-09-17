# Trip costs and multiple maintenance issues rollout

**Status: deployed to staging on 16 September 2026; production remains unchanged.**

Staging migrations are recorded as `20260917003925` (trip expense) and
`20260917003944` (maintenance issues). Cloudflare deployment
`05502c2d-8e1d-490c-8126-af49bdd9d13a` successfully built commit
`f61252cf31cccbcd2e0b7d3644303efd7287079a` from `codex/staging`.
The staging project's primary and preview settings both still point to
`netxgjqeaakbkjqvtdhl`; the live project remains on `main` commit
`3778a01efdbd453ddb97f0b565e52c4ef3253f38` with previews disabled.

## Exact SQL to review

Target first: **staging Supabase `netxgjqeaakbkjqvtdhl`**.
Do not execute against production `hjebavtcdduortshufku`.
Apply these exact migration files in order:

1. [Trip expense RPC](../supabase/migrations/20260916120000_add_trip_expense.sql)
2. [Maintenance issues, backfill, compatibility and RPC](../supabase/migrations/20260916130000_maintenance_issues.sql)

The linked files are the complete SQL. They add no dependency, seed, reset or
data copy. The second migration is expansion-compatible: it backfills each
existing order as one issue and keeps older deployed maintenance inserts working.
Apply both migrations before deploying the new staging application code.

After future changes receive SQL and deployment approval, apply their compatible
migrations before pushing `codex/staging` so Cloudflare project
`fleet-ops-staging` deploys them. Confirm the deployment commit and that
both production and preview environment settings for that project still point to
staging Supabase. Then test with staging accounts and data only:

- create a trip with Fuel and confirm itemized revenue, costs and net;
- add the TRK-02 SLE 3,250,000 Fuel omission through Add missing cost and confirm
  the existing SLE 10,000,000 revenue less all SLE 4,000,000 costs shows SLE
  6,000,000 net;
- create Problem Reported, Repair and Regular Service records with several issues,
  including custom Other and Oil Change alongside another service issue;
- retry interrupted writes and confirm no duplicate order, issue or ledger row;
- confirm Collections & Finance cannot access maintenance issues and Maintenance
  & Repairs cannot append trip costs;
- check the truck form at 320, 375, 768, 1024 and wide desktop widths, and confirm
  the vehicle profile has one Edit vehicle details control.

Deployed public smoke checks confirmed the built asset contains the staging
Supabase host and no production host, the three role entry screens load at 375px,
and only the staging Pages hostname was requested before sign-in. Authenticated
staging writes and the TRK-02 Fuel correction still require a staging user session.

Production requires a separate review of the same migrations and the full release
diff after staging acceptance. Never copy staging data into production. The old
production preview URLs remain unsafe for testing.

## Sources

SRC-TRIP-MAINTENANCE-20260916-USER and SRC-TRIP-MAINTENANCE-20260916-REPO in
sources.md.
