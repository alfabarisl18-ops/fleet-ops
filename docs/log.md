# Change log

Append-only, newest last. One entry per significant change.

---

## [2026-08-08] foundation | Phase 1 — schema, migrations, seed data, types

Branch `phase-1-foundation`. No screens, no application code beyond a mount
point.

**Stack.** Vite 8 + React 19 + TypeScript 5.9 + Tailwind 4, Supabase (Postgres
17), Dexie reserved for the Phase 9 offline queue. TypeScript is pinned to the
5.x line rather than 7.x because `typescript-eslint@8` requires `<6.1.0`.

**Database.** 31 tables, 36 enums, 146 indexes, 90 RLS policies, 87 check
constraints, 41 triggers, 18 helper functions, across 13 migrations, applied to
the `fleet-ops` Supabase project (`hjebavtcdduortshufku`), which was empty
beforehand. Full detail in [schema.md](schema.md).

Enforced in Postgres rather than in application code:

- Shortfall treatment derived from day outcome, as a generated column. Only
  Full Day produces driver debt.
- Business dates default to `app.freetown_today()`; a trigger rejects any
  business date after today in Freetown. Event timestamps are overwritten by
  trigger, so a device cannot supply one.
- Money rows are append-only: all deletes blocked, updates confined to a narrow
  allow-list of review columns. Outstanding balances cannot increase.
- One daily payment record per vehicle per day, by unique index.
- `client_record_id` with a unique index on every table a device writes to.
- Vehicle and maintenance status changed only by inserting a status event.
- No audio: a check constraint rejects any `audio/*` document.
- Deny by default — `anon` holds no privilege anywhere in the database.

The final migration asserts all of the above and fails if any of it stops being
true, so a table added later without a policy breaks the build.

**Verified.** 19 business-rule checks and a 16-action permission matrix run
against the live database by signing in as each of the four roles. Results in
[schema.md](schema.md). Both Supabase security-advisor warnings are intentional
and explained there.

**Found and fixed during verification.** The first attempt withheld the driver ID
and licence image keys by column grant, which denied all four roles rather than
the two mobile ones — all four share the Postgres role `authenticated`. Replaced
with `public.driver_identity_images()`. See
[decision 0004](decisions/0004-driver-identity-images-via-rpc.md).

**Seed.** 4 users (one per role), 3 drivers, 5 Sprinters, 1 box truck, 5 routes.
Deliberately no credentials: every user has `auth_user_id` NULL and
`app_private.user_pin_credentials` is empty. Deliberately no money: fabricated
ledger entries would make every Accounting total in Phase 8 a lie that looks
like a bug. Vehicle statuses reproduce SPEC's own example — 3 active, 2
grounded, 1 in maintenance.

**Decisions recorded.** [0001](decisions/0001-no-second-password-hash.md)
through [0006](decisions/0006-status-changes-are-events.md).

**Not done, by scope.** No screens, no `src/data/` layer, no Supabase client, no
auth. Phase 2 next.
