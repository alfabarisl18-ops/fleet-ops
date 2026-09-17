# Trip costs and multiple maintenance issues rollout

**Status: prepared locally; no hosted SQL or new deployment has been run.**

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

After SQL approval and successful application, push `codex/staging` so Cloudflare
project `fleet-ops-staging` deploys it. Confirm the deployment commit and that
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

Production requires a separate review of the same migrations and the full release
diff after staging acceptance. Never copy staging data into production. The old
production preview URLs remain unsafe for testing.

## Sources

SRC-TRIP-MAINTENANCE-20260916-USER and SRC-TRIP-MAINTENANCE-20260916-REPO in
sources.md.
