# Fleet Operations SL

A private operations system for a family transport business in Sierra Leone.
Vehicles, drivers, daily payments, maintenance, accounting, vehicle acquisition.

**Read `SPEC.md` before implementing anything.** It is the authoritative product
specification. If this file and SPEC.md disagree, SPEC.md wins on product
behaviour and this file wins on process.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS
- Supabase — Postgres, Auth, Storage, Row Level Security
- Dexie (IndexedDB) for the offline write queue
- PWA, installable on Android
- Deployed to Cloudflare Pages

## Commands

```
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint
npm run test
```

## Hard rules

- **Never commit to `main`.** Work on a branch. Show me the diff before merging.
- **Never deploy** without asking.
- **Never run any SQL against the hosted Supabase project without asking me
  first.** Not just destructive SQL — migrations, additive changes, seed data,
  everything. Show me the SQL and wait for a yes before it touches the hosted
  database.
- **Money is `integer` minor units** (SLE × 100) everywhere — database, API,
  application code. Never `float`, never `numeric`, never a JavaScript number
  holding decimal leones. Format only at the render layer.
- **Money rows are append-only.** Never `UPDATE` a ledger entry or a payment
  record. Write a correction row that supersedes it.
- **Every money record has two dates**: `applies_to_date` and `received_at`.
  Never collapse them into one.
- **Every insertable row has `client_record_id`** — a UUID generated on the device
  before the write, with a unique index. This is what makes offline sync safe.
- **Permissions are enforced in Postgres RLS**, not in the UI. A hidden button is
  not a permission. Every table gets policies before it gets a screen.
- **Never print credentials** in the UI, in logs, or in seed output.
- **English only.** No internationalisation layer, no Krio.
- **No audio anywhere.** No microphone access, no recording, no playback, no
  transcription. Maintenance notes are typed text.

## Repository

`github.com/alfabarisl18-ops/fleet-ops` — private.

The older `fleet-operations-sl` repo is the previous build and the only copy of
the working app. Never push to it, never modify it. It stays as reference.

## Conventions

- `snake_case` in the database, `camelCase` in TypeScript, mapped at the data
  layer.
- Enums as Postgres enum types, mirrored as TypeScript union types.
- One file per screen under `src/screens/`, shared pieces under
  `src/components/`.
- Data access goes through `src/data/` — screens never call Supabase directly.
- Dates stored as `date` for business dates, `timestamptz` for event times.
- **Business dates are computed in `Africa/Freetown`, on the server, always.**
  The team is split across Freetown, the US and China. A collector's phone, the
  Owner's laptop in the US and the Fleet Manager's machine in China can be on
  three different calendar days at the same moment. `service_date` and
  `applies_to_date` mean the date in Freetown regardless of who is looking.
  Never derive a business date from `new Date()` on the client.
- Every user-facing status string comes from a single constants file so wording
  stays consistent.

## Vocabulary — use these exact words

- Vehicle status is **Active**, **Grounded**, **In maintenance**. Never "Safe",
  never "Running".
- Roles are **Owner/Admin**, **Fleet Manager**, **Collections & Finance**,
  **Maintenance & Repairs**. Never "Mother", never "Father", never a person's
  name as a role.
- Day outcomes are **Full Day**, **Half Day**, **Driver's Day**, **Breakdown**,
  **Did Not Work**.
- Currency displays as `SLE 1,000`. Expenses display as `−SLE 1,000`.

## The rule that trips people up

A payment shortfall becomes **driver debt** only when the vehicle worked a
**Full Day**. Half Day, Breakdown and Did Not Work shortfalls are **accepted
losses** recorded against the vehicle's target — real money missing, but owed by
nobody. `shortfall_treatment` is derived from `day_outcome` in the data layer and
must never be selectable by the person entering the record.

Outstanding balances belong to the **driver**, not the vehicle, and follow the
driver across vehicle changes.

## Working style

- Small, reviewable changes. One concern per branch.
- Write the migration and the RLS policy in the same change as the feature.
- When SPEC.md is ambiguous, ask rather than guess. Several requirements here look
  similar but are deliberately different.
- Do not invent features. If it is not in SPEC.md, raise it before building it.
