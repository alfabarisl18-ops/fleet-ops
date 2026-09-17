# Source ledger

This ledger starts with the staging separation work; it does not retroactively
claim provenance coverage for older pages.

## SRC-STAGING-20260907-USER

- Kind: user decision; author: repository owner.
- Location: Codex task, approved “Separate staging from the live site” plan,
  2026-09-07; permission: user-authorized repository workflow.
- Used by: deployment.md, decisions/0024-separate-staging-branch.md,
  AGENTS.md, CLAUDE.md, log.md.

## SRC-STAGING-20260907-CLOUDFLARE

- Kind: configuration inspection; publisher: Cloudflare account API.
- Retrieved: 2026-09-07 through GET/PATCH/GET of
  `/accounts/{account_id}/pages/projects/{project_name}` for `fleet-ops`
  and `fleet-ops-staging`. Only non-secret facts recorded.
- Before: both primary branches were `main`; both allowed all previews.
  Live Production/Preview pointed to `hjebavtcdduortshufku`;
  staging Production/Preview pointed to `netxgjqeaakbkjqvtdhl`.
- After: live remains `main`, previews `none`; staging primary branch is
  `codex/staging`, previews `all`; database settings unchanged.
- Live deployment baseline: `d4357875-0c04-4b7e-b083-224aac17dfff`,
  commit `3778a01efdbd453ddb97f0b565e52c4ef3253f38`.
- Initial successful staging branch deployment:
  `f1377e98-e9a3-4f3f-993d-367b5ede9294`, same application commit.
- Permission: account configuration read/updated for the approved task;
  no API response containing credentials is copied into the repository.
- Used by: deployment.md, decisions/0024-separate-staging-branch.md, log.md.

## SRC-STAGING-20260907-DOCS

- Kind: official documentation; publisher: Cloudflare.
- URL: https://developers.cloudflare.com/pages/configuration/branch-build-controls/
- Retrieved: 2026-09-07; API fields also checked against Cloudflare OpenAPI.
- Licence/permission: linked and summarized; no documentation copied.
- Used by: deployment.md, decisions/0024-separate-staging-branch.md.

## SRC-STAGING-20260907-REPO

- Kind: repository source; author: project contributors.
- Snapshot: `3778a01efdbd453ddb97f0b565e52c4ef3253f38`.
- Locations: `src/lib/supabase.ts` (environment-selected client),
  `supabase/functions/_shared/mobile-auth.ts` (`SITE_URL`),
  `docs/decisions/0020-site-url-becomes-an-edge-function-secret.md`.
- The pre-existing uncommitted 2026-09-04 log entry is separately identified
  as working-tree history, not falsely attributed to this commit.
- Permission: user-owned private repository; no external source copied.
- Used by: deployment.md, decisions/0024-separate-staging-branch.md.

## SRC-STAGING-20260907-BROWSER

- Kind: observed browser verification; author: Codex, 2026-09-07.
- Target: https://fleet-ops-staging.pages.dev, deployed application commit
  `3778a01efdbd453ddb97f0b565e52c4ef3253f38`.
- Method: headless Playwright with a fresh browser context, allowing requests
  only to the staging site and staging Supabase host.
- Observed: desktop, collections and maintenance sign-in pages returned HTTP
  200 and displayed their expected headings. One deliberately invalid desktop
  sign-in reached only staging `/auth/v1/token`, returned HTTP 400, and showed
  “Incorrect email or password.” No unexpected hosts or uncaught page errors.
- Limits: no valid credentials used; successful authentication and business
  record writes were not tested. No hosted SQL or production requests.
- Permission: authorized staging verification; no real credentials or
  business data copied.
- Used by: deployment.md, log.md.

## SRC-OPERATIONS-20260907-USER

- Kind: user-approved implementation plan in this Codex task, 2026-09-07.
- Author/permission: repository owner, implementation authorized; hosted SQL requires separate approval.
- Decisions: assignment route synchronization, automatic forward-only purchase deferral,
  original/adjusted end dates, extra purchase payments, zero-payment Service with no monthly cap.
- Used by: SPEC.md, schema.md, agent instructions, decisions 0025 onward, log.md.

## SRC-OPERATIONS-20260907-REPO

- Kind: repository code, snapshot 94fe6e6; user-owned private source.
- Locations: src/data/driverPurchaseAgreements.ts, src/screens/VehiclePaymentScreen.tsx,
  migrations 20260811003250, 20260812010000, 20260818010000.
- Used by: implementation decisions and schema documentation.

## SRC-PGLITE-20260907

- Publisher: ElectricSQL; official documentation, retrieved 2026-09-07.
- URL: https://pglite.dev/docs/
- Linked/summarized only. Local test runtime installed outside the project;
  no production dependency or browser payload. Platform scaffolding is not a hosted Supabase test.
- Used by: database validation documentation.


## SRC-TRIP-MAINTENANCE-20260916-USER

- Kind: user-approved implementation plan in this Codex task, 2026-09-16.
- Author/permission: repository owner; repository implementation authorized.
  Hosted SQL, remote push/deployment and production release require later approval.
- Decisions: per-trip Fuel, append-only missing trip costs, multi-issue maintenance
  records, one vehicle-details edit control and mobile-width cleanup.
- Used by: SPEC.md, schema.md, trip-maintenance-rollout.md, decisions 0028 -0029,
  log.md.

## SRC-TRIP-MAINTENANCE-20260916-REPO

- Kind: repository source; author: project contributors.
- Snapshot: local feature commits f9f66de, c4cc09e and a0784f5 based on staging.
- Locations: src/data/accounting.ts, src/data/maintenance.ts,
  src/screens/RecordTripForm.tsx, src/screens/TripDetailScreen.tsx,
  src/screens/AddMaintenanceOrderForm.tsx, src/screens/VehicleProfileScreen.tsx,
  migrations 20260916120000 and 20260916130000.
- Permission: user-owned private repository; no external source copied.
- Used by: schema.md, trip-maintenance-rollout.md, decisions 0028 -0029, log.md.
