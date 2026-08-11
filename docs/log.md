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

---

## [2026-08-09] fix | `trips` aligned with the resolved Trips spec

`SPEC.md`'s Trips section was rewritten resolving open question 1 (box trucks
are paid per trip, not per day) after Phase 1 shipped, so `public.trips` had
drifted from it. New migration
[20260809091500_trips_match_resolved_spec.sql](../supabase/migrations/20260809091500_trips_match_resolved_spec.sql),
applied to the hosted project. The table was empty — Trips is a Phase 5 build
item — so this was a plain `ALTER`, no data migration.

- `origin` / `destination` renamed to `pickup_location` / `destination_location`.
- `cargo` dropped, folded into `notes` — the mobile entry screen still ends on
  a free-text note, so a load description has somewhere to go rather than
  disappearing.
- `duration_days` added: `GENERATED ALWAYS` from `departed_on`/`returned_on`,
  same pattern as `bundled_payments.covers_to_date`. Inclusive of both days; no
  `CASE` needed since date arithmetic on a null input already returns null.
- `load_quantity`, `load_weight`, `load_weight_unit` added. New enum
  `public.weight_unit` (`LB | KG`).
- No money column exists on `trips`, and that's enforced by a migration-time
  check, not just stated in a comment — same guarantee the Phase 1 guards
  migration gives every other table, applied here because this is the one
  table where a financial fact is deliberately kept off the row it describes.

**Also fixed:** `trips_select_desktop` / `trips_insert_desktop` restricted
trips to desktop roles, written before the Trips rewrite put trip entry on the
mobile Collections & Finance screen. Replaced with
`trips_select_desktop_or_collections` / `trips_insert_desktop_or_collections` —
Collections & Finance can now create and read trips, matching the pattern
every other mobile-insert table already uses (create, never edit). Desktop
keeps `update`. Maintenance & Repairs still has no access — SPEC never gives
that role trips or money.

**Verified against the live database:** inclusive-day duration (`1` for a
same-day trip, `3` across three calendar days), `duration_days` null while
`returned_on` is unset, the generated column rejected on direct insert, the
paired `load_weight`/`load_weight_unit` constraint, both old column names
gone, the enum rejecting a non-member value, and the full read/insert/update
matrix across all four roles. `src/types/database.ts` regenerated;
`src/types/db.ts`'s `GENERATED_COLUMNS.trips` updated so `Insertable<'trips'>`
rejects `duration_days` at compile time, with a test. `npm run test`,
`typecheck`, `lint` and `build` all pass (14 tests).

---

## [2026-08-10] feature | Phase 2 — authentication for all four roles

Branch `phase-2-auth`. Desktop email/password ("standard flow," unmodified
Supabase Auth) and mobile PIN sign-in, both minted into real Supabase
sessions and tested against real RLS policies with real tokens — not
simulated JWT claims. Full design in
[decision 0007](decisions/0007-pin-sign-in-becomes-a-real-session.md).

**The mechanism.** A PIN check happens in `public.verify_role_pin`
(`service_role` only, bcrypt via `pgcrypto`), then the Edge Function
`pin-sign-in` mints a real session via `admin.generateLink` +
`admin.verifyOtp` — confirmed via primary sources (the shipped
`@supabase/auth-js` types, official docs, and direct testing against the
hosted project) rather than assumed, because a first-pass design putting the
PIN-check function in `app_private` would have been unreachable: tested
directly, `Accept-Profile: app` returns `PGRST106` for every caller
regardless of role, before any grant is even checked. `app_private.user_pin_credentials`
stays exactly as unreachable as Phase 1 left it; `public.verify_role_pin` is
the one narrow, audited door in — same shape as `driver_identity_images()`.

**Two real security bugs found by testing, both fixed same-day:**

- `app.is_owner()`/`is_desktop()`/etc. return `NULL`, not `false`, for any
  caller `app.current_app_role()` can't resolve. `NOT NULL` is `NULL`, and
  PL/pgSQL's `IF <null> THEN` silently skips the branch — so
  `IF NOT app.is_owner() THEN raise; END IF;` does not raise for an
  unresolved caller; it falls through as authorized. Found while testing the
  new `admin_reset_pin`, but the same shape already existed in
  `driver_identity_images()` since Phase 1 — confirmed live to leak a real
  driver's ID and licence document keys to any caller holding an
  unrecognized (not necessarily malicious, just unlinked) Supabase JWT.
  Closed in `20260810010924_fix_null_unsafe_role_negation.sql`, by
  `coalesce(is_X(), false)` before every such negation, plus a regression
  test that checks each function's *current* `CREATE OR REPLACE` body, not
  every historical line.
- `admin.generateLink`'s `magiclink` type auto-creates a new `auth.users` row
  when the given email matches nobody, instead of erroring. Found when a
  mismatched synthetic email (a bootstrap-script mistake, not the shipped
  code) silently minted a session for a brand-new, unlinked identity.
  `pin-sign-in` now verifies `otpData.session.user.id === result.auth_user_id`
  before it will hand back a session, and refuses rather than ship one for
  the wrong account.

**A platform surprise, found by testing, not assumed:** this project's
`SUPABASE_SERVICE_ROLE_KEY` — the default env var every Edge Function
receives — holds the newer `sb_secret_...` key format, not a legacy JWT.
`supabase-js`'s `.from()` sends that key on both `apikey` and
`Authorization: Bearer`; PostgREST accepts the former and rejects the latter
as an unparseable JWT, for table requests specifically (`.rpc()` and the Auth
admin API tolerate it fine). `adminTableRequest`
(`supabase/functions/_shared/mobile-auth.ts`) works around it with a raw
`fetch` sending the key on `apikey` only, used wherever an Edge Function
reads or writes a table directly.

**A mid-build redesign, not silently absorbed:** the first working design
showed a name picker before the PIN (`public.mobile_role_roster`, the first
`anon` grant in this database) — built, deployed, and verified end to end.
Told directly that these two roles are low-stakes by design and the picker
was more ceremony than the risk called for, sign-in became role + PIN only.
That requires PINs to be unique — enforced in `admin_reset_pin` — and trades
the original per-account throttle for a coarser per-role one
(`app_private.role_pin_throttle`): a wrong guess can no longer be blamed on
one account before a match is found, so 5 wrong guesses locks *the whole
role's* PIN entry for 15 minutes, not just one person's. `mobile_role_roster`
and the original per-account `verify_pin` are untouched and still correct —
unused by any current screen, available for a future one that already knows
the account.

**Idle expiry** is enforced by the same role-resolution choke point every
RLS policy already calls (`app.current_user_id()`/`current_app_role()`), not
by Supabase's own session lifecycle, which has no idle concept. Mobile roles
additionally require a live `public.sessions` row (30 minutes since
`last_seen_at`, 12-hour hard cap); desktop roles are untouched. Verified
against a real, previously-valid session: backdating `last_seen_at` cut off
both reads and writes immediately, and `public.touch_session` restored
access exactly the same way a client heartbeat would.

**Verified end to end, not just at the SQL layer:** curl against the
deployed Edge Functions for both mobile roles (roster, wrong PIN, correct
PIN, 5-attempt lockout confirmed per-role not global, `driver_identity_images`
and a maintenance-order write both correctly denied, `admin-provision-mobile-account`'s
reject path with a real non-owner token) and a full click-through in a real
browser for both mobile roles end to end — roster/PIN entry, session
establishment, the `SignedIn` confirmation screen, sign-out, and session
persistence across a fresh tab. Desktop roles verified via simulated JWT
claims (the same legitimate method Phase 1 used) since real password-based
login needs infrastructure judged disproportionate to build for this phase —
first Owner bootstrap stays a documented manual Dashboard step.

**Also found and fixed while testing the real screens:** `App.tsx`'s initial
session-check effect unconditionally reset navigation to the chooser screen
on resolution, which a React 19 StrictMode double-invoke could fire *after*
the user had already tapped something, silently bouncing them backward.
Fixed with the same cancelled-flag guard already used in the roster-fetch
effect.

**Screens.** `RoleChooser`, `DesktopSignIn`, `MobilePinSignIn` (role, then
PIN — no name step), `SignedIn`. Nothing else, per scope. `src/data/auth.ts`
is the only file that touches Supabase directly for sign-in.

**Not done, by scope.** No Settings/PIN-management UI (the mechanism —
`admin_reset_pin` — exists and is tested; no screen calls it yet). No
password-reset flow for desktop roles.

`npm run typecheck`, `lint`, `test` (17 tests) and `build` all pass.

---

## [2026-08-11] vehicles-drivers | Phase 3 — data layer (vehicles, drivers, driver-purchase agreements)

Branch `phase-3-vehicles-drivers`. This entry covers the data layer only —
`src/lib/money.ts`, `src/data/vehicles.ts`, `src/data/drivers.ts`,
`src/data/driverPurchaseAgreements.ts`, and one new database function. No
screens yet.

**`src/lib/money.ts`.** String-based minor-units parsing and formatting
(`parseMinorUnits`/`formatMinorUnits`) — deliberately not `parseFloat(x) *
100`, to stay clear of float-precision artefacts. 16 tests in
`money.test.ts`, including the classic `0.1 + 0.2` trap made concrete.

**New database function: `assign_driver_to_vehicle(client_record_id,
driver_id, vehicle_id, route_id)`.** Inserts a `driver_assignments` row and
updates `vehicles.current_driver_id` in one transaction — two writes that
must land together, not two separate client-side calls that could partially
fail. SECURITY INVOKER (the default): authorization is exactly the existing
RLS on both tables from Phase 1, not reimplemented here.

Found and fixed twice while verifying it against real seed data, before it
was ever used from a screen:

1. Every seeded driver already has an open assignment
   (`driver_assignments_one_open_per_driver`), so a naive insert-only version
   failed on the very first real reassignment attempt. Fixed by having the
   function end the driver's prior open assignment (and the target vehicle's,
   if someone else held it) before inserting the new one — "assign this
   driver to this vehicle" means making that true now, not rejecting the
   call because it was true of something else a moment ago.
2. That fix still left `vehicles.current_driver_id` wrong on the vehicle the
   driver had *left* — it only ever wrote the new vehicle's column. A driver
   moved from SPR-04 to SPR-05 left SPR-04 still pointing at them. Fixed by
   clearing the prior vehicle's `current_driver_id` in the same transaction
   when it differs from the target.

Verified via SQL against the hosted project (Owner/Admin role, rolled back):
reassignment moves `current_driver_id` correctly on both vehicles, the old
`driver_assignments` row is closed, re-assigning a driver to the vehicle
they're already on is a safe no-op, and Collections & Finance is denied by
RLS exactly as expected.

**Generator gap found while wiring this up:** `supabase gen types` has no
visibility into a Postgres function parameter's nullability — every RPC arg
comes out non-nullable even when the SQL side accepts NULL
(`assign_driver_to_vehicle`'s `p_route_id`, for a vehicle with no route).
Documented and corrected once in `src/types/db.ts`
(`NULLABLE_RPC_ARGS`/`RpcArgs<T>`/`rpcArgs()`) rather than casting at each
call site — the file's existing charter is exactly "things the generator
gets wrong go here."

**`src/data/vehicles.ts`, `drivers.ts`, `driverPurchaseAgreements.ts`.**
camelCase in and out, snake_case never leaves these files. Route and
current-driver names are fetched as small separate queries rather than a
PostgREST embed. `drivers` queries list columns explicitly — the table has a
column-restricted SELECT grant from Phase 1 (`id_image_key`/
`licence_image_key` excluded) and `select('*')` fails outright.
`fetchOpenAgreementForVehicle` mirrors `dpa_one_open_per_vehicle` client-side
so the driver-purchase-agreement setup screen (not yet built) can show a
clear message before submit; `createAgreement` also maps the database's own
`23505` as a backstop against a submission race.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.
Screens are next.

---

## [2026-08-11] vehicles-drivers | Phase 3 — screens, and the first real desktop workspace

Same branch. This entry covers `App.tsx`'s new desktop routing and the eight
screens from the Phase 3 plan. Phase 2 left desktop roles at a dead-end
confirmation screen; this is the first real multi-screen navigation.

**Architecture.** `src/screens/DesktopWorkspace.tsx` — a hand-rolled
discriminated-union `DesktopView` state, the same pattern `App.tsx` already
uses for the sign-in flow, per the plan's "no router yet" decision.
`App.tsx` routes `OWNER_ADMIN`/`FLEET_MANAGER` here on sign-in;
`COLLECTIONS_FINANCE`/`MAINTENANCE_REPAIRS` still land on the unchanged
Phase 2 `SignedIn` screen. `src/components/WorkspaceHeader.tsx` is the one
shared piece — identity, Home link, sign out — across every desktop screen.

**Screens.** `DesktopHome`, `VehicleList`, `AddVehicleForm`,
`VehicleProfileScreen`, `DriverList`, `AddDriverForm`, `DriverProfileScreen`,
`SetUpDriverPurchaseAgreementForm` — exactly the eight in the plan, in that
order. Assigning a driver to a vehicle is reachable from both sides (SPEC
section 4: "assigned to a vehicle at either point") as an inline panel on
each profile screen, not a separate ninth screen. `AddDriverForm` is
reusable from the Drivers workspace and from a vehicle profile's "+ Add a
new driver" action — created driver is assigned to that vehicle immediately
in the same flow.

**New: `public.freetown_today()`.** The driver-list "overdue balances" card
needs to compare `outstanding_balances.promised_date` against today, and
CLAUDE.md is explicit that a business date is never `new Date()` on the
client. `app.freetown_today()` already existed but the `app` schema is
unreachable over PostgREST for any caller, including `service_role` —
confirmed empirically in Phase 2. Added a thin, read-only,
`SECURITY INVOKER` wrapper in `public`, same revoke/grant pattern as every
other exposed `app`-schema function this phase.

**Verified live**, signed in as the real Owner/Admin account (Al) against
the hosted project, not the seed script: added a vehicle (SPR-06, with a
purchase price — first real screen to render `formatMinorUnits`, confirmed
`SLE 45,000`); assigned an already-assigned seeded driver (Abu Bakarr
Jalloh, previously on SPR-02) to it and confirmed both sides of the
Phase-3-data-layer bug fix live — his assignment history shows SPR-02
ending and SPR-06 starting on the same day, and SPR-02's profile correctly
now shows "No driver currently assigned"; set up a driver-purchase
agreement on SPR-06 and confirmed it displays correctly (amount, payment,
frequency, and "Ownership transfer: Not started" — never asked on the
form); confirmed the vehicle-profile pre-check works as the primary
duplicate-agreement guard — the "Set up…" action is replaced by the
agreement itself once one exists, per the plan's exact spec.

**Not independently click-tested, and why:** the form-level duplicate-
agreement fallback (`createAgreement`'s `23505` catch) calls the identical,
already-verified `fetchOpenAgreementForVehicle` used by the pre-check —
treated as covered by that verification plus code review, not re-clicked
through. `DriverList`/`AddDriverForm` were not live-tested: verifying
role-gating required signing out of the real Owner/Admin session, and
signing back in needs a password this session was never given (a live
session from an earlier sign-in was being reused, not fresh credentials).
Both screens share `AddVehicleForm`'s exact pattern (controlled inputs,
optional-field spreading, error handling) proven live, pass the full check
suite, and were not touched after that pattern was established — flagged as
a real, if low-risk, verification gap rather than silently assumed fine.
Role-gating itself (`OWNER_ADMIN`/`FLEET_MANAGER` → workspace, the two
mobile roles → unchanged `SignedIn`) was confirmed by direct code
inspection — a one-line condition reusing a screen Phase 2 already proved
correct live for both mobile roles — rather than reproducing that PIN
sign-in test here.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.

---

## [2026-08-11] vehicles-drivers | Phase 3 — verification gap closed with QA accounts, not real credentials

Same branch, no code changes. The previous entry's final report disclosed
two open items: `DriverList`/`AddDriverForm` weren't click-tested live
(verifying role-gating meant signing out of the real Owner/Admin session
with no way back in), and mobile-role gating was confirmed by code
inspection rather than reproducing Phase 2's live PIN test. The user then
pasted their real Owner/Admin password into chat to unblock it — correctly
declined (a password is never entered into any field, even one handed over
directly), but that left the real password sitting in the chat transcript
and the actual gap still open.

Fixed properly instead of asking for a password again: `public.users`
already had three accounts that were exactly what verification needs and
nothing more — M. Sesay (Fleet Manager, bootstrapped for Phase 2 testing
per decision 0007), F. Kamara (Collections & Finance), I. Turay
(Maintenance & Repairs) — all already linked to real `auth.users` rows,
none of them the Owner's real identity. Gave each a known test credential
(Fleet Manager password via a direct, shown-before-running
`auth.users.encrypted_password` update using the same bcrypt format GoTrue
itself writes; the two PINs via `public.admin_reset_pin`, called under a
simulated Owner/Admin session the same way this session already tested
`assign_driver_to_vehicle`) and used them to finish verification live:

- Signed in as Fleet Manager, confirmed the same `DesktopWorkspace` as
  Owner/Admin (SPEC section 4: shared screens), clicked through
  `DriverList` (summary cards and list render correctly) and
  `AddDriverForm` (created a driver, landed on its profile with the right
  data) — the concrete gap from the prior entry, closed.
- Signed in as Collections & Finance and separately as Maintenance &
  Repairs with the new PINs, confirmed both land on the unchanged
  `SignedIn` screen, not `DesktopWorkspace` — reproducing Phase 2's own
  live PIN test rather than relying on code inspection.

New: [docs/qa-accounts.md](qa-accounts.md), documenting these three as a
standing convention for every future phase, not a one-off fix — including
the rule that the actual credentials are never committed to a git-tracked
file, even in a private repo.

**Byproduct:** a real driver row ("Ibrahim Sesay") was created in the
hosted project during the `AddDriverForm` click-through — genuine QA
output, not business data. Flagged to the user rather than removed
unilaterally; there is no driver-delete feature in the app by design (SPEC:
"A driver is never deleted — status moves to FORMER"), so removing it
cleanly needs either a deliberate SQL delete (asked for first, as usual) or
just leaving it and moving it to FORMER status once there's a screen for
that.

**Still open, and can only be closed by the user:** the real Owner/Admin
password is still in this chat's transcript from before it was declined.
Rotating it in the Supabase Dashboard is the one step only the user can do.
