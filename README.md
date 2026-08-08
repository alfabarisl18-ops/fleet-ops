# Fleet Operations SL

A private operations system for a family transport business in Sierra Leone.
Vehicles, drivers, daily payments, maintenance, accounting, vehicle acquisition.

`SPEC.md` is the authoritative product specification. `CLAUDE.md` covers process.
`docs/` records how it was built and why — start at [docs/index.md](docs/index.md).

**Status: Phase 1 (foundation) complete.** Database schema, migrations, seed
data and generated types. No screens yet.

## Requirements

- Node `^20.19.0 || >=22.12.0`
- A Supabase project (one already exists: `fleet-ops`)
- Docker Desktop, only if you want to run the database locally

## Setup

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the
Supabase dashboard under Project Settings → API. Both are safe in the browser:
every permission is enforced by row level security in Postgres, which is why the
publishable key is the only key the application ever sees. The service role key
bypasses RLS completely and must never appear in a `VITE_` variable or anywhere
in `src/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server on port 5173 |
| `npm run build` | Type-check and produce a production build |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest, once |
| `npm run db:push` | Apply pending migrations to the linked Supabase project |
| `npm run db:diff` | Show what the local schema would change |
| `npm run db:reset` | Rebuild the local database from migrations, then seed |
| `npm run db:types` | Regenerate `src/types/database.ts` from the schema |

`db:reset` and local development need Docker. `db:push`, `db:diff` and
`db:types` work against the hosted project without it.

Run `npm run db:types` after every migration. `src/types/database.ts` is
generated wholesale and must never be hand-edited; corrections and helpers go in
`src/types/db.ts`.

## Rules that are not negotiable

These are enforced by the database, not by convention. Fighting them means
you have misread the requirement.

- **Money is `bigint` minor units** — SLE × 100. Never float, never numeric.
  Format only at the render layer. Expenses render as `−SLE 1,000`; the stored
  amount is positive and `direction` carries the sign.
- **Business dates are Freetown dates, computed on the server.** Omit the column
  and let the default fill it. `new Date()` is the viewer's local day, and the
  team is spread across Freetown, the United States and China.
- **Money rows are append-only.** Deletes are blocked outright; updates are
  confined to review metadata. A mistake is a correction row and a superseding
  entry.
- **Every insertable row carries a device-generated `client_record_id`.** This
  is what makes a retried offline sync idempotent. Generate it on the device
  before the write, never let the server default fill it.
- **Permissions live in Postgres RLS.** A hidden button is not a permission.
  Every table has policies before it gets a screen.
- **A shortfall becomes driver debt only after a Full Day.** This is a generated
  column. The database will reject any attempt to set it.
- **No audio anywhere.** A check constraint rejects any `audio/*` document.
- **English only. SLE only.**

## Repository

`github.com/alfabarisl18-ops/fleet-ops` — private.

The older `fleet-operations-sl` repository is the previous build and the only
copy of the working app. Never push to it, never modify it.
