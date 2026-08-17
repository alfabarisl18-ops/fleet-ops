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

---

## [2026-08-11] vehicles-drivers | Phase 3 — delete a driver (Owner/Admin only)

Same branch. SPEC and `fleet.sql` both said "a driver is never deleted —
status moves to FORMER." The user asked for real deletion, Owner/Admin
only, with a confirmation step, for a driver added by mistake who never
went into service. Full reasoning, including why only 2 of the 11 tables
that reference `drivers.id` cascade, is in
[decision 0008](decisions/0008-driver-delete-cascades-only-its-own-two-tables.md)
— short version: `driver_assignments` and `driver_purchase_agreements`
(the two Phase 3 itself writes to) now `ON DELETE CASCADE`; the other 9
(all belonging to phases that don't exist yet, always empty today) stay
`ON DELETE RESTRICT` unchanged, so deleting a driver with real payment/trip
history will correctly start failing again automatically once a later
phase populates one of those tables.

New: `public.delete_driver(p_driver_id)` (`SECURITY DEFINER`, self-enforced
Owner/Admin-only, same pattern as `admin_reset_pin`) and
`public.driver_delete_preview(p_driver_id)` (read-only counts, powers the
confirmation dialog's wording — never a bare "are you sure"). `src/data/drivers.ts`:
`deleteDriver`, `fetchDriverDeletePreview`. `DriverProfileScreen.tsx`: a
"Delete driver" action visible only to Owner/Admin (`DesktopWorkspace` now
threads the signed-in role down to it).

**Verified against the hosted project** (transaction + rollback, same
pattern used throughout this phase): created a throwaway driver with a real
assignment and agreement, confirmed the preview reports both counts
correctly, deleted it, confirmed the driver row, the assignment, and the
agreement are all gone, and separately confirmed
`vehicles.current_driver_id` clears via its own pre-existing `SET NULL` FK.
Confirmed a simulated Fleet Manager session is rejected by `delete_driver`
and gets zero rows back from `driver_delete_preview`. `npm run typecheck`
and `lint` pass.

`npm run test` (33 tests) and `build` pass. Live in the Browser pane as the
Fleet Manager QA account: confirmed the delete action does not appear
anywhere on a driver profile (Owner/Admin only, as designed). The
Owner/Admin side of the click-through wasn't separately reproduced live —
same reason as the previous entry, no credentials for that account — but
`delete_driver` was exercised for real (not rolled back) via a simulated
Owner/Admin session to remove the "Ibrahim Sesay" test driver flagged in
the previous entry, and the driver list was confirmed live to reflect it:
active-driver count dropped from 4 to 3, the row is gone. That flagged
byproduct is now closed.

---

## [2026-08-11] records-spine | Phase 4 — Records spine: activity feed, corrections, audit log

New branch `phase-4-records-spine`, off `main` (Phase 3 merged first, per
the user's request). Phase 1 built `ledger_entries`, `activity_records`,
`corrections`, and `audit_log` with schema, RLS, and grants already in
place — its own comment said so: "Phase 1 creates the table and its
policies. The triggers that populate it from each workflow belong to
Phase 4." This phase is that population mechanism, plus a real corrections
workflow for vehicles and drivers. Full reasoning in
[decision 0009](decisions/0009-corrections-cover-vehicles-and-drivers-approve-and-apply-collapse.md).

**`activity_records` population.** `AFTER INSERT` triggers on `vehicles`,
`drivers`, `vehicle_status_events`, `driver_assignments`,
`driver_purchase_agreements` — plain triggers, not `SECURITY DEFINER`,
since the existing `activity_insert_signed_in` policy already lets
whichever role is performing the outer insert write their own row.
`delete_driver()` gets one explicit insert for "driver deleted," not a
generic delete-trigger (a generic one would also fire for every
cascade-deleted assignment/agreement row, producing confusing noise on top
of the one real event).

**Corrections: request → apply/reject.** Request is a plain client insert
(RLS already allowed it); a new `BEFORE INSERT` trigger captures
`before_json` from the live target row server-side, never trusted from the
client. `public.apply_correction()` and `public.reject_correction()` — both
`SECURITY DEFINER`, self-enforced Owner/Admin-only, same pattern as
`admin_reset_pin`/`delete_driver()`. Applying uses an explicit per-table
column allow-list (`CASE WHEN after_json ? 'col'`), not dynamic SQL,
writes `audit_log` (the only way that table ever gets a row — no client
role has `INSERT` on it), and writes its own `activity_records` entry.

**Historical backfill.** The approved plan said the Records page should
show real history "on day one," not just activity from today forward —
which the triggers alone don't do, since they only fire on new inserts.
Added a one-time backfill for every vehicle, driver, status change,
assignment, and agreement that predates this migration (including Phase
1's original seed data). Disclosed limitation: vehicles/drivers never
stored who created them, so backfilled rows' `entered_by` is the active
Owner/Admin account performing the migration, not the real historical
actor — every row from this point forward has correct, real attribution
from the trigger that wrote it.

**Two real bugs found while verifying, both fixed before this landed:**

1. `activity_records.driver_id` was still `ON DELETE RESTRICT` from Phase
   1, back when nothing populated the table. The moment every driver got a
   `DRIVER_ADDED` row referencing themselves, `delete_driver()` started
   blocking on every driver's own "added" record — caught by testing the
   already-shipped delete-driver feature against the new trigger, not
   assumed safe. Changed to `ON DELETE SET NULL`: deleting a driver should
   detach their activity history, not erase it or block the delete.
2. That fix then hit `activity_records`' own append-only trigger (Phase 1,
   no allow-list = fully frozen) — `SET NULL` is implemented as an
   `UPDATE` even when the database performs it internally as part of a
   cascade, and the trigger blocked that too. Widened the allow-list to
   permit `driver_id` specifically; everything else on the row stays
   frozen.
3. (Cosmetic, not structural, but a real vocabulary-rule violation): the
   vehicle-status-change trigger interpolated the raw enum
   (`"SPR-05 moved to GROUNDED"`) instead of the display label CLAUDE.md
   requires ("Grounded"). Fixed the trigger for new events and corrected
   the two already-backfilled rows via a one-time, explicitly-scoped
   trigger-disable/fix/re-enable — not a precedent for editing
   `activity_records` normally.

**Verified against the hosted project:** SQL-level (transaction +
rollback) — each of the five insert-triggers produces the right activity
record; a full request → apply cycle changes the target row, writes
`audit_log` with the correct before/after, and writes its own activity
record; reject leaves the target row untouched; a non-Owner is rejected by
both `apply_correction` and `reject_correction`. Live in the Browser pane,
signed in as the real Owner/Admin account: Records page shows real
backfilled history with working filters; opened a record's detail view and
clicked through to its vehicle; requested a correction on SPR-06 (added a
color), approved it, confirmed the color changed, `audit_log` recorded the
right before/after, and both `CORRECTION_REQUESTED`/`CORRECTION_APPLIED`
appear in the Records feed. Then, signed in as the Fleet Manager QA
account: confirmed "Request a correction" works and Approve/Reject do
**not** appear — closing the "Owner/Admin click-through not reproducible
live" limitation from the previous two entries, this time with a genuinely
authenticated session rather than a SQL stand-in.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.

---

## [2026-08-12] daily-payments | Phase 5 — daily payments (Sprinter-only)

New branch `phase-5-daily-payments`. Phase 1 built `daily_payment_records`,
`bundled_payments`, `outstanding_balances`, `balance_settlements`, and
`driver_credits` with the five-outcome rule already enforced by
`GENERATED ALWAYS` columns. Nothing had ever written to them. This is the
recording workflow: the mobile Collections & Finance screens, the RPCs
that make one submit atomically produce the right consequences, and the
desktop review action. Full reasoning in
[decision 0010](decisions/0010-daily-payments-sprinter-only-bundle-and-overpayment-design.md)
— Sprinter-only (box trucks are trip-based, deferred), no debt
forgiveness (SPEC's own open question), the bundle-distribution
assumption, the overpayment cascade, and why driver-purchase-installment
re-categorization is included even though it wasn't in the written plan
(it's the exact deferral named when Phase 3 built
`driver_purchase_agreements`).

**New:** `app.apply_daily_payment_effects()` (shared side effects: the
`outstanding_balances` row for a `DRIVER_DEBT` shortfall, the
`ledger_entries` row for money received, correctly categorized as a
driver-purchase installment when one's open on the vehicle);
`public.record_daily_payment()` (single day, plus overpayment routing —
settle the driver's open balances oldest-first, cascading across more
than one if needed, or hold the excess as a credit);
`public.record_bundled_payment()` (several days at once, sharing the same
side-effect helper); `public.override_shortfall_treatment()` (Owner/Admin
or Fleet Manager convert an accepted shortfall to driver debt on review).
Three new `activity_records` triggers extending Phase 4's pattern
(`daily_payment_records`, `bundled_payments`, and `ledger_entries` rows
with no `source_type` — i.e. "Other Payment," which has no
`daily_payment_records` row to already represent it).

**Two real, pre-existing bugs found while verifying against the hosted
project, both fixed at the root, not worked around:**

1. `app.enforce_append_only()` (Phase 1) falsely flagged *any* update to
   `daily_payment_records` — the first table with both a `GENERATED`
   column and a partial mutable-columns allow-list — as changing the
   generated column, because Postgres recomputes generated columns
   *after* `BEFORE` triggers run. Fixed by excluding generated columns
   from the comparison; they can never be directly set by a client
   anyway, so nothing is lost. This was a latent bug since Phase 1,
   invisible until this phase became the first to `UPDATE` a row with a
   generated column present.
2. `apply_daily_payment_effects()`'s `ledger_entry_id` link-back silently
   affected zero rows for a Collections & Finance submission — confirmed
   live, not assumed — because `dpr_update_desktop` only lets desktop
   roles `UPDATE` that table. The `ledger_entries` row itself was still
   created correctly; only the back-reference (and, downstream, the
   `balance_settlements.ledger_entry_id` link for an overpayment) was
   silently missing. Fixed by making the function `SECURITY DEFINER` —
   the row was already authorized at insert time by RLS, this only
   finishes bookkeeping the inserting role is entitled to have happen.

**Mobile: `CollectionsWorkspace`**, replacing the dead-end `SignedIn`
screen for `COLLECTIONS_FINANCE` the same way `DesktopWorkspace` replaced
it for desktop roles (`MAINTENANCE_REPAIRS` unchanged, still Phase 6's
job). "Vehicle Payment" (vehicles grouped by type, box trucks excluded,
the five-outcome flow, the bundle toggle) and "Other Payment" (general
ledger entry, category filtered by the income/expense toggle).

**Desktop:** `DriverProfileScreen` shows real balance history now
(`outstanding_balances` was legitimately empty until this phase — Phase
3's own comment said so); `RecordDetailScreen` gets the shortfall-review
action for `DAILY_PAYMENT_RECORDED` records.

**Verified against the hosted project:** SQL-level (transaction +
rollback) — all five day outcomes produce the correct
`shortfall_treatment`/side effects; overpayment settling against one
balance and cascading across two; `ADVANCE` creates a credit; a 6-day
bundled payment produces 6 correctly-split `daily_payment_records` rows
plus the summary activity record; `override_shortfall_treatment` converts
correctly, rejects a second attempt, and rejects a non-Owner/Fleet-Manager
caller; RLS denies Maintenance & Repairs from recording a payment at all;
driver-purchase-installment re-categorization confirmed. Live in the
Browser pane, signed in as the Collections & Finance QA account: recorded
a real Full Day (confirmed the `ledger_entry_id` bug live before the fix,
then confirmed the fix on the next submission), a real Half Day shortfall
with a cause, and a real Other Payment (expense, correctly signed
`−SLE 150`). Signed in as the Fleet Manager QA account: confirmed the new
record types appear correctly in the Records feed with working filters,
and confirmed the shortfall-review action correctly refuses to convert a
shortfall on a vehicle with no driver assigned (a real edge case the
verification surfaced, not anticipated in the plan) rather than silently
misattributing debt.

**Not separately click-tested live:** the bundled-payment mobile flow
(exhaustively proven correct via SQL instead) and the override happy path
with a driver actually assigned (also SQL-proven; the one vehicle
available for live testing happened to have no current driver, itself a
useful real-world edge case).

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.

## [2026-08-13] maintenance | Phase 6 — Maintenance (orders, statuses, parts, both workspaces)

Phase 1 built the full maintenance schema — `maintenance_orders`,
`maintenance_status_events` (drives `status`/`is_grounded`/`closed_at` via
a `SECURITY DEFINER` trigger, the `vehicle_status_events` pattern),
`maintenance_parts`, `maintenance_notes` — with RLS and grants already in
place. Nothing had ever written to them until this phase.

**New migration:** one function, `public.record_maintenance_part`
(`SECURITY DEFINER` from the start — see decision 0011), and the
Records-spine `AFTER INSERT` triggers on all three writeable maintenance
tables (`MAINTENANCE_ORDER_OPENED`, `MAINTENANCE_STATUS_CHANGED`,
`MAINTENANCE_PART_ADDED`), additive to `maintenance_status_events`' own
projection trigger, not a replacement for it.

**Shared screens:** `AddMaintenanceOrderForm` and
`MaintenanceOrderDetailScreen` built once, used by both `DesktopWorkspace`
and the new mobile `MaintenanceWorkspace` — see decision 0011 for why one
pair of screens covers both roles, and the `OIL_CHANGE` literal-string
finding.

**Mobile: `MaintenanceWorkspace`**, replacing the dead-end `SignedIn`
screen for `MAINTENANCE_REPAIRS` (now deleted — nothing else used it).
Three entry points: New maintenance record, Open records (list → the
shared detail screen), and Vehicle status (a standalone quick action
reusing `changeVehicleStatus` directly, unchanged from Phase 3).

**Desktop: `MaintenanceList`**, a new Home entry point. Dashboard cards
(Total Records, Vehicles Grounded, Recorded Cost, Old Parts Not Returned
— the simple totals, not Phase 8's analytics breakdown), the order list,
`+ New maintenance record`, click-through to the shared detail screen.
The `old_parts_returned` toggle is gated to desktop roles in the UI (the
real boundary is `mo_update_desktop`).

**Verified against the hosted project:** SQL-level (transaction +
rollback) — `PROBLEM_REPORTED` without a `problem_descriptor` rejected;
both oil-change constraints correctly reject/require once tested with the
literal `OIL_CHANGE` string (a first pass with `'Oil Change'` was a test-
data mistake, not a schema gap — see decision 0011); a status-event
insert correctly drives `status`/`is_grounded`/`closed_at` through two
transitions; `record_maintenance_part` creates and links the matching
`PARTS` ledger row; RLS denies Collections & Finance from touching any of
the four maintenance tables; `old_parts_returned` and
`record_maintenance_part` both reject a non-desktop/non-maintenance
caller. Live in the Browser pane: signed in as the Maintenance & Repairs
QA account (PIN, I. Turay) — opened a real Problem Reported order on
SPR-01, added a part with cost (confirmed the `SECURITY DEFINER` ledger
link-back live for that exact role), changed status to Still Grounded
(confirmed the vehicle's own status is a separate, deliberate action —
maintenance grounding doesn't cascade into `vehicles.status`), and used
the Vehicle status quick action. Signed in as the Fleet Manager QA
account: confirmed the dashboard cards compute correctly, opened a
Regular Service order and checked Oil Change live (confirmed the checkbox
correctly hides the free-text fields and saves the literal string),
toggled `old_parts_returned` and confirmed it persisted across a reload
and updated the dashboard count, and confirmed all three new record types
render correctly in the Records feed with working filters.

One UX fix made during live testing, not anticipated in the plan: the
shared detail screen's vehicle name rendered as a button that did nothing
on mobile (no vehicle profile screen there) — `onOpenVehicle` is now
optional, and the fleet ID renders as plain text when it's omitted.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass. No
maintenance-specific automated tests were added — this phase's
correctness rests on the SQL-level and live verification above, matching
how prior phases' database-enforced business rules were verified.

## [2026-08-13] alerts | Phase 7 — Alerts (4 of 21 types, with working deep links)

Phase 1 built the full `public.alerts` schema with nothing ever writing
to it. This phase wires 4 of SPEC's 21 alert types to what's already
built — `MAINTENANCE_DUE`, `MAINTENANCE_OVERDUE`, `VEHICLE_GROUNDED`,
`BALANCE_OUTSTANDING`, `MISSED_PAYMENT` — the rest belong to Accounting
(Phase 8) and Future Purchases (Phase 10).

**Migration:** two plain `AFTER` triggers for the two types with a single
causing event (`VEHICLE_GROUNDED` on `maintenance_orders.is_grounded`,
`BALANCE_OUTSTANDING` on `outstanding_balances.status`), plus one daily
`pg_cron` job (`app.evaluate_scheduled_alerts()`, confirmed with the
user, 06:00 GMT = Freetown local) for the three genuinely date-driven
types. `alerts_resolved_pair` amended to allow automated resolution
without a human resolver; a one-time backfill catches conditions that
predate the migration (SPR-01's already-grounded order from Phase 6
testing, three vehicles missing yesterday's payment record). Full
reasoning in decision 0012.

**`src/data/alerts.ts`** — read-only by design: fetches and one review
action, nothing here ever raises or resolves an alert by hand, matching
how the rest of this app treats state as something that reflects
reality. **`AlertsBell`** (new, `src/components/`) — badge count, a
dropdown panel, clicking an alert both marks it reviewed and opens the
exact record in one action. Rendered from `WorkspaceHeader`, which
neither mobile workspace uses — satisfies SPEC's "no alerts bell in
either mobile workspace" for free.

**Deep links** route on `subject_type`, matching SPEC's own phrasing for
what "the exact record" means: maintenance alerts open the maintenance
order; `BALANCE_OUTSTANDING` opens the driver profile with a new
`highlightBalanceId` prop that scrolls to and highlights the row (no
standalone balance screen exists); `MISSED_PAYMENT` opens the vehicle
profile.

**Closed a Phase 6 gap this phase depends on:** `MaintenanceOrderDetailScreen`
gets a new desktop-only "Reminder" panel for `reminder_date`/
`expected_completion_on`/`estimated_grounded_days` — without it,
`MAINTENANCE_DUE`/`MAINTENANCE_OVERDUE` could never fire.

**Two real bugs found and fixed during verification**, both in
`app.evaluate_scheduled_alerts()`: a `CASE` expression inside an
`INSERT ... SELECT` needed an explicit `::alert_severity` cast (Postgres
doesn't infer it there the way it does in a plain `VALUES` insert); and
`reviewed_at` was being set from the client's clock, caught by this
project's own `no-restricted-syntax` ESLint rule — fixed with a small
server-side stamp-on-review trigger, same pattern as every other event
time in this app.

**Verified against the hosted project:** SQL-level (transaction +
rollback) — both triggers fire and resolve correctly; the scheduled
function creates and resolves all three date-driven types under the
right conditions, including severity escalation and the
`MAINTENANCE_OVERDUE`-supersedes-`MAINTENANCE_DUE` rule; a second
idempotent run doesn't duplicate; RLS confirms only Owner/Admin and
Fleet Manager can see, insert, or update alerts. Also surfaced a real
testing-technique gap, not a schema bug: simulating a second role via
`set_config` silently no-ops once the connection has already demoted to
`authenticated` (a genuine Supabase security boundary) — fixed by
`reset role` between switches; documented in decision 0012 since every
future SQL verification in this project needs it.

Live in the Browser pane, Fleet Manager QA account: the bell showed the
real backfilled count (4), opening the panel listed real alerts
(`SPR-01` grounded, three vehicles' missed payments), clicking each
correctly marked it reviewed (badge dropped) and opened the exact
record — the maintenance order for `VEHICLE_GROUNDED`, the vehicle
profile for `MISSED_PAYMENT`. Set a reminder date on `SPR-01`'s order
through the new panel, confirmed it persisted, then confirmed the full
loop by re-running the scheduled function and watching a real
`MAINTENANCE_DUE` alert appear for it. The `BALANCE_OUTSTANDING` →
driver-profile-with-highlight path was proven at the SQL/RLS level but
not separately click-tested live — no outstanding balance existed in
this session's data to generate one from.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.

## [2026-08-14] accounting | Phase 8 — Accounting (income, expenses, box-truck trips, approvals, targets)

Phase 1 built `ledger_entries` with everything this phase needs already
in place — nothing in `src/` had ever aggregated it; every prior phase
only wrote individual rows. This is the first read/reporting layer over
data four phases have already produced.

**Migration:** `record_trip`, `flag_ledger_entry`, and
`approve_flagged_expense` RPCs; a plain trigger raising/resolving
`UNUSUAL_EXPENSE`/`DISPUTED_EXPENSE` on `ledger_entries.approval_status`
changes; `VEHICLE_BELOW_TARGET` added to Phase 7's daily
`evaluate_scheduled_alerts()` (calendar-year-to-date income vs. a
pro-rated `yearly_target_minor`); two more server-stamp fixes
(`reconciled_at`, matching Phase 7's `reviewed_at`). Full reasoning,
including a real mid-implementation correction, in decision 0013.

**A real mistake, caught and fixed before it shipped:** the plan
assumed trip entry was a desktop screen using the *original* Phase 1
`trips` schema (`origin`/`destination`/`cargo`). Applying the migration
failed outright — a later Phase 1 follow-up had already rewritten
SPEC's Trips section to put entry on the **mobile Collections & Finance
screen** ("under Sprinter & Box-Truck Payment → box truck selected")
with different columns (`pickup_location`/`destination_location`, no
`cargo`, plus `load_quantity`/`load_weight`/`load_weight_unit`). Fixed
before any frontend code was written: `record_trip` rebuilt against the
real schema, callable by both desktop and Collections & Finance;
`RecordTripForm` built as a mobile screen reached from
`VehiclePaymentScreen`'s existing vehicle picker, which now includes
box trucks and branches to trip entry instead of the day-outcome flow.

**New:** `src/data/accounting.ts` (read-only analytics — ledger summary,
recent transactions, Sprinter income, Truck income, known expenses,
owed-to/owed-by, backdated/unreconciled counts, target progress — plus
`recordTrip`/`flagLedgerEntry`/`approveFlaggedExpense`/
`reconcileLedgerEntry`/`updateVehicleTarget`), `AccountingHome.tsx`
(desktop, three clickable summary cards plus the ledger split),
`SprinterIncomeScreen.tsx`, `TruckIncomeScreen.tsx`,
`KnownExpensesScreen.tsx` (where a transaction gets flagged
unusual/disputed), `ApprovalsList.tsx` (Approve gated to Fleet Manager
in the UI, real enforcement is `approve_flagged_expense`'s own role
check), `RecordTripForm.tsx` (mobile). `VehicleProfileScreen` gets a
small inline Yearly target edit, closing a gap that column had no edit
path at all since Phase 3 (excluded from the correction allow-list,
decision 0009).

**Verified against the hosted project:** SQL-level (transaction +
rollback) — `record_trip` creates the trip and correctly linked
INCOME/EXPENSE ledger rows; the trip-expense category constraint
accepts all three SPEC categories and rejects others;
`flag_ledger_entry`/`approve_flagged_expense` correctly gate to Fleet
Manager only (Owner/Admin refused, matching SPEC's literal wording);
the approval-change trigger fires and resolves correctly; a vehicle
genuinely behind its pro-rated target gets `VEHICLE_BELOW_TARGET`, one
on pace doesn't; RLS confirms Collections & Finance and Maintenance &
Repairs can't reach the flag/approve actions or (for Maintenance &
Repairs) record a trip. Live in the Browser pane: recorded a real trip
as Collections & Finance through the real PIN-authenticated mobile
path (not simulated claims — this is exactly what decision 0011 flagged
as unprovable that way, proven for real this time), confirmed Truck
Income showed the correct net; flagged and approved a real expense as
Fleet Manager, confirmed the resulting alert resolved; set a vehicle's
yearly target through the new panel, confirmed Sprinter Income and a
real `VEHICLE_BELOW_TARGET` alert both reflected it end to end,
including the deep link back to the vehicle profile. The Owner/Admin-side
rejection of `approve_flagged_expense` was proven at the SQL level and
by reading the UI's role gate directly, not through a live Owner/Admin
session — `docs/qa-accounts.md` explicitly reserves that account and
says Fleet Manager already covers these screens.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.

## [2026-08-15] offline-sync | Phase 9 — Offline sync (PWA shell, write queue, flagged duplicates)

Dexie and vite-plugin-pwa were installed since Phase 1, never wired up.
This phase builds both pieces SPEC section 8 calls for: a local write
queue for all 9 mobile-write functions, and (confirmed with the user) a
full PWA shell — service worker, manifest, installability — not the
queue alone.

**PWA shell:** `vite-plugin-pwa`, `generateSW` strategy, precaches only
the app JS/CSS/HTML/icon/manifest. Deliberately no `runtimeCaching`
entry for Supabase — confirmed in the built `dist/sw.js` that the only
registered route is the SPA navigation fallback. Reads never go stale;
only writes queue.

**The queue:** `src/lib/offlineQueue.ts` (generic Dexie-backed mechanism,
`withOfflineQueue` wrapping each write, `flushQueue` replaying pending
ones) plus `src/lib/offlineQueueReplay.ts` (the registry mapping each of
the 9 mobile-write functions to its real implementation, kept separate
to avoid a circular import). All 9 — `recordDailyPayment`,
`recordBundledPayment`, `recordTrip`, `recordOtherPayment`,
`createMaintenanceOrder`, `changeMaintenanceStatus`,
`recordMaintenancePart`, `addMaintenanceNote`, `changeVehicleStatus` —
now return `{status: 'saved'|'queued'}` instead of throwing when there's
no signal. `PendingSyncBadge.tsx` (new, mobile analog of `AlertsBell`)
shows what's still pending in both mobile workspace headers.

**Same-vehicle-day collisions** (SPEC: "becomes a flagged duplicate for
review, never a silent overwrite") are handled on *both* the live path
and the queued-retry path — a real gap found during design, not after:
two collectors can both be online at once, so the collision isn't only
a queued-retry scenario. New table `flagged_duplicate_payments` (the
first table added since Phase 1's up-front schema — see decision 0014
for how the project's own "run the guards last" safety test was updated
to allow it, explicitly, without weakening it) plus
`FlaggedDuplicatesList.tsx` (desktop, reached from Accounting) for a
reviewer to dismiss what landed there.

**Two real bugs found and fixed during live verification**, both in
decision 0014: `orderBy('createdAt')` needs `createdAt` indexed in
Dexie's schema (it wasn't); supabase-js's `PostgrestError` isn't
`instanceof Error`, so the original `err instanceof Error ? err.message
: String(err)` silently produced `"[object Object]"` and the
duplicate-detection string match never fired — a live duplicate
submission surfaced this as a generic error instead of the flagged-
review flow before the fix.

**Verified against the hosted project:** SQL-level (transaction +
rollback) for `flag_duplicate_payment`'s RLS (desktop-select,
Collections & Finance and desktop can both call it, Maintenance &
Repairs cannot). Live in the Browser pane, simulating offline via
`navigator.onLine` override (the harness has no direct network-offline
toggle): recorded a vehicle payment as Collections & Finance while
offline, confirmed it queued (badge showed 1 pending, zero rows
server-side), went back online, used the manual "Retry now," confirmed
the real record landed; recorded a maintenance order as Maintenance &
Repairs the same way, confirmed the "Saved — will sync when back
online" banner and badge, confirmed it flushed correctly. Forced a real
same-vehicle-day collision while online (not queued) — confirmed the
correct user-facing message instead of a generic error, confirmed
nothing was overwritten (exactly one `daily_payment_records` row),
confirmed it appeared in the desktop `FlaggedDuplicatesList` and that
dismissing it there correctly server-stamped `resolved_by`/`resolved_at`.
Confirmed the built app installs the manifest and registers the service
worker (`dist/index.html`'s auto-injected `<link rel="manifest">` and
register script, confirmed present).

**Not separately tested:** the `online` browser event's auto-flush
listener specifically (the harness can flip `navigator.onLine` but
doesn't dispatch a real `online` event) — the function it calls
(`flushOfflineQueue`) is the identical one the manual "Retry now" button
already proved works.

---

## [2026-08-16] future-purchases | Phase 10 — Future Purchases (goals, landed cost, funding, transit, onboarding)

Phase 1 built the entire schema this phase needed — `purchase_goals`,
`planned_vehicles`, `acquisition_cost_lines`, `acquisition_payments`,
`savings_targets`, `cash_reservations`, `transit_records`, plus the
polymorphic `documents` table — all desktop-only via RLS. Nothing in
`src/` had ever written to any of them. This phase adds two RPCs, one new
invariant, two event triggers, wires the last 12 of 21 alert types, and
(confirmed with the user) builds real Supabase Storage upload rather than
document screens alone — the first real file upload anywhere in the app.

**Two RPCs, both `SECURITY INVOKER`** (desktop already has every grant
they need — no privilege bypass to make, same reasoning `record_trip`
documents): `record_acquisition_payment` (payment + linked
`VEHICLE_PURCHASE` ledger expense, same link-back shape as
`record_maintenance_part`) and `onboard_vehicle` (creates the real
`vehicles` row from a planned vehicle at Ready for onboarding, summing
*actual* landed cost as `purchase_price_minor`, linking
`onboarded_vehicle_id` back). A new check constraint,
`pv_active_in_service_is_onboarded`, makes `onboard_vehicle` the only
path into stage Active/in service — a plain stage update can reach every
other stage.

**Alerts:** two new event triggers (`VEHICLE_READY_FOR_ONBOARDING` on a
stage change, `SHIPPING_DEPARTURE` on `shipped_on` going from null to
set — the latter has no auto-resolve, it's a one-time fact) plus 10 new
blocks in the existing daily `app.evaluate_scheduled_alerts()` cron job.
Every numeric threshold is a stated default inferred from the schema,
not a SPEC number — full table in decision 0015.

**Storage:** a new private `documents` bucket, RLS scoped to desktop
only (mirrors the `documents` table's own desktop policies, not its
mobile ones — the pre-existing gap where Maintenance/Collections have a
table grant but no upload path stays a disclosed limitation, not fixed
here). `src/lib/documents.ts` validates mime type and size client-side
before upload, generates the document id client-side so the storage key
(`{ownerType}/{ownerId}/{id}-{filename}`) is known up front.

**Frontend:** `FuturePurchasesHome` (all 8 SPEC cards, clickable),
`PurchaseGoalList`/`AddPurchaseGoalForm`/`PurchaseGoalDetailScreen`
(funding progress bar, Owner-gated cash reservations, forecasting from
real `ledger_entries`, candidate comparison cards — never auto-selected),
`PlannedVehicleDetailScreen` (all 25 landed-cost categories est/actual,
stage control — "Advance to `<next>`" plus every other stage including
Cancelled, payments, transit once a plan reaches Awaiting shipment),
`OnboardVehicleForm`, `PlannedVehicleList`/`OverduePurchaseActionsList`
(the four cross-goal stage cards and the overdue-actions card), shared
`DocumentPanel`. `vehicles` gets no new columns — make/model/VIN/etc.
stay on the acquisition side as the vehicle's attached history, per
structural rule against duplicate sources of truth (decision 0015).

**Verified against the hosted project:** SQL-level (transaction +
rollback, Fleet Manager desktop role) — full happy path goal → candidate
→ cost lines → deposit payment (confirmed ledger link) → 12 stage
transitions → confirmed the check constraint blocks a direct jump to
Active/in service → `onboard_vehicle` (confirmed vehicle row, landed
cost, `onboarded_vehicle_id`, alert auto-resolved and attributed to the
acting user) → cash reservation correctly blocked for Fleet Manager
(`0 rows`, policy text confirmed) → 12 of 14 alert conditions raised
then resolved live (`SHIPPING_DEPARTURE`'s no-auto-resolve and
`DEPOSIT_OR_INSTALLMENT_DUE`'s resolve leg both explained, not just
asserted — see decision 0015). `npm run typecheck && lint && test &&
build` all clean; no new advisor warnings. Live in the Browser pane as
M. Sesay (QA Fleet Manager): created a real goal with a budget, added a
candidate, edited a landed-cost line, recorded a deposit, walked every
stage to Ready for onboarding (confirmed the alert fired and appeared in
the bell), onboarded it into a real vehicle (confirmed purchase price
and yearly target carried over correctly, confirmed the alert
auto-resolved), confirmed Home's card counts updated.

**A real bug found live, not by inspection:** the Home summary and goal
list both embedded `savings_targets(total_budget_minor)` in a
`purchase_goals` query and read it as an array
(`(g.savings_targets ?? [])[0]?.total_budget_minor`) — silently
`undefined` every time, because `savings_targets.goal_id` is `unique`
(Phase 1), so PostgREST returns a to-one embed as a single object, not
an array (unlike the `cash_reservations` embed in the same query, which
has no unique constraint and does come back as an array). "Amount Still
Required" showed `SLE 0` for a goal with a real SLE 50,000 budget until
caught by comparing the Home card against the goal detail screen's own,
separately-queried figure. Fixed and reverified live. Full detail in
decision 0015.

**Not cleaned up:** live verification created real rows in the hosted
project — a purchase goal, its candidate, a payment/ledger entry, and a
real vehicle (`SPR-TEST-99`) now visible in the actual fleet list. The
user was shown a proposed cleanup and hasn't yet confirmed the deletion
SQL; the DELETE statements need approval before they touch the hosted
database, same rule as everything else.

---

## [2026-08-16] export-settings | Phase 11 — Export report and Settings

The last two Home cards SPEC names, closing out the build order. No
migration this phase — everything reuses schema and functions Phase 1/2
already built.

**Export:** confirmed with the user — a CSV of ledger transactions over
a date range, generated entirely client-side (`src/data/export.ts`:
`fetchTransactionsForExport`, a pure `buildTransactionsCsv` with proper
RFC 4180 quoting, `downloadCsv` via `Blob` + a same-page `<a download>`
click). No new dependency; a PDF report would have needed one.

**Settings:** `src/data/users.ts` (new) is almost entirely a thin layer
over mechanisms Phase 2 already shipped and never gave a UI —
`public.admin_reset_pin` and the `admin-provision-mobile-account` Edge
Function, both built specifically so a later phase could "build the
mechanism, not necessarily a UI for it yet" (that RPC's own comment).
`PeopleList.tsx` (Owner/Admin manages; Fleet Manager reads — matches
`users_update_owner`'s RLS exactly), `AddPersonForm.tsx` (mobile roles
only — desktop account creation is out of scope on purpose, an existing
Phase 2 boundary, not a new one), an inline PIN-reset dialog. A person's
role can only move within its own device category (desktop↔desktop,
mobile↔mobile) and nobody can edit their own row — both client-side
guards, not server constraints, documented as such. No separate
permissions table exists; "permissions" in Settings is an explanatory
block, not another control surface. See decision 0016 for the reasoning
behind every one of these.

**Verified:** SQL transaction+rollback confirming Fleet Manager is
blocked on both `INSERT` and `UPDATE` against `users`. `npm run
typecheck && lint && test && build` all clean (bundle +16 KB raw / +3 KB
gzip). Live in the Browser pane as M. Sesay (Fleet Manager): People list
correctly read-only, Export correctly built a real CSV from real ledger
data (verified the actual string output, not just that the button didn't
error). Owner-only actions aren't provable live under the same
"never use the real Owner account" rule Phase 10 hit — covered by the
SQL-level RLS test plus the fact the underlying mechanisms were already
proven end-to-end in Phase 2's own testing.

**A live incident, not a code bug:** mid-verification the Browser pane's
session resolved to the real Owner/Admin account instead of the QA
session that had just been active — a stale `localStorage` token
surviving a dev-server restart, not anything this phase wrote. Caught
immediately, no action taken as that identity, the stored session
cleared and QA sign-in redone before continuing. Full account in
decision 0016.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.

---

## [2026-08-16] debt-forgiveness | Driver debt forgiveness (SPEC open question 7), plus three field-reported bugs

`public.forgive_driver_debt` — Owner/Admin only, reason required, checked
inside the function body since `outstanding_balances`' own RLS is
broader than this one action. Zeroes the balance, marks it
`WRITTEN_OFF`, and records the forgiven amount as an `OTHER_EXPENSE`
ledger entry so it stays visible in the books rather than silently
disappearing. `ForgiveDebtPanel` on `DriverProfileScreen`, matching
`ResetPinPanel`/`ReservationPanel`'s inline-panel convention.

**A bug the test suite caught before it shipped:** the first version's
`if not app.is_owner()` is null-unsafe — `NOT NULL` is `NULL`, not
`TRUE`, so an invalid session would silently pass instead of being
blocked. The exact bug class this project already fixed once before.
`npm run test` failed immediately via `db.test.ts`'s guard-pattern check;
fixed in a follow-up migration with `coalesce(app.is_owner(), false)`.

**Three bugs from real device use, fixed in the same pass:** date input
text was invisible in system dark mode (`src/index.css` set
`color-scheme: light dark` globally with zero dark-mode styling anywhere
in the app — pinned to `light`; this was also the entire cause of a
separate "dates aren't editable" report — the date was there, just
invisible); the maintenance area field became a dropdown
(`MAINTENANCE_AREAS` in `src/data/maintenance.ts`, with an "Other" +
free-text escape hatch) instead of free text — "I don't want no input
field."

**Verified:** SQL transaction test confirming a Fleet Manager session
and a null/invalid session are both blocked from calling
`forgive_driver_debt`. Live: the dark-mode fix confirmed via
`getComputedStyle` with the Browser pane forced into dark mode, not just
visually; a real maintenance record saved end-to-end as I. Turay with
`service_area = 'Engine'` from the new dropdown. Owner-only forgiveness
itself not exercised live, under the standing "never use the real
Owner/Admin account for testing" rule. Full account in decision 0017.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.

---

## [2026-08-18] rent-to-own | Rent-to-own redesign (SPEC open question 2): the installment becomes the daily target

Confirmed with the user: once a driver-purchase agreement is set up, the
vehicle's daily payment target *becomes* the installment — the
collector's ordinary day-outcome entry is the only way it gets
collected, no second flow. Every shortfall (Full Day, Half Day,
Breakdown) becomes driver debt while an agreement is active — the
accepted-loss exception is suspended for that vehicle. Weekly/Monthly
installments divide evenly into a daily figure. Payoff retires the
vehicle (archived).

**Schema:** `shortfall_treatment` (decision 0003's `GENERATED ALWAYS`
column) grows one more input — a new `under_active_agreement` snapshot
column, filled by the same trigger that already snapshots
`expected_amount_minor`. Changing a generated column's expression means
drop, re-add, and re-index; confirmed directly against production data
that every historical row (`under_active_agreement` defaults `false`)
recomputes to exactly the value it already had. Three new RPCs:
`set_up_driver_purchase_agreement` (creates the agreement and sets the
vehicle's target in one transaction — replacing a plain insert that had
no effect on the target at all), `complete_driver_purchase_agreement`
(archives the vehicle via `vehicle_status_events`, never a direct
column write), `cancel_driver_purchase_agreement` (reason required,
deliberately does not restore the previous target). Closed a real,
independent pre-existing gap: `expected_daily_amount_minor` had no edit
path anywhere in the app before this — new `updateExpectedDailyAmount`
and a `VehicleProfileScreen` panel matching the existing yearly-target
one.

**A bug caught before testing, the same class the test suite has now
caught twice:** the two new agreement RPCs were first written relying
only on RLS, no in-body role check. Corrected before running anything to
match `override_shortfall_treatment`/`forgive_driver_debt`'s existing
pattern, coalescing from the start.

**A real RLS gap, found only by testing live as the actual mobile
role:** `driver_purchase_agreements` has exactly one SELECT policy,
desktop-only. Collections & Finance had zero read access — so the
mobile day-outcome screen's "this becomes debt regardless of outcome"
warning never showed, even with a real active agreement. Fixed with a
narrow SECURITY DEFINER function, `vehicle_has_active_purchase_agreement`,
granted to any authenticated role — reveals only the one boolean fact
the mobile screen needs, nothing about the agreement's amount, driver,
or terms. A Fleet Manager or Owner/Admin test session would never have
hit this.

**Verified:** SQL, transaction+rollback against real hosted data,
nothing kept — all three payment frequencies compute the correct
daily-equivalent, a Half Day shortfall under an active agreement
produces `DRIVER_DEBT` where it would previously have been
`ACCEPTED_LOSS`, completing archives the vehicle, cancelling leaves the
target untouched. Live, as the real QA roles: as M. Sesay, set up a
Daily agreement — the pre-submit daily-equivalent preview and the
resulting target both showed correctly; as F. Kamara, recorded a Half
Day under that agreement — the debt-warning banner showed, the record
saved, and the database confirms `DRIVER_DEBT` and a new open balance;
the vehicle profile's paid/remaining figures updated correctly
afterward. Completing an agreement (archiving a vehicle) was
deliberately left to the SQL test only — a real, one-way action with no
supported undo in the app, unlike every other step tested live. Full
account, including the two live-only test data artifacts left on
`SPR-TEST-99`, in decision 0018.

`npm run typecheck`, `lint`, `test` (33 tests) and `build` all pass.
