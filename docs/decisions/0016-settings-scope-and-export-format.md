# 0016 — Settings: scope inherited from Phase 2, the same-category role guard, and Export as CSV

**Decided:** 2026-08-16 · **Status:** accepted

SPEC gives Export and Settings one line each: "Export produces a
downloadable report" and "Settings covers people, roles, PINs and
permissions." Both were built to close out SPEC's build order (item 11,
the last unbuilt vertical) — but Settings' real scope was mostly already
decided in Phase 2, not invented here.

**Confirmed with the user:** Export is a CSV of ledger transactions over a
date range, generated client-side — not a full multi-table data dump, not
a PDF. No new dependency; a PDF library would have been the one thing in
this phase that cost bundle size, and nothing here needed it.

## Settings does not build desktop account creation — that boundary already existed

Decision 0007 (Phase 2) already ruled this out: the first Owner/Admin
account, and every one since, is created once via the Supabase Dashboard,
documented in README.md, "not a shortcut the running application takes."
`admin-provision-mobile-account` — the Edge Function this phase's "Add
person" calls — only ever provisions the two mobile roles; it was written
that way in Phase 2, deliberately, before this phase existed. Settings'
"create a person" therefore only offers Collections & Finance and
Maintenance & Repairs. Nothing here reopens the desktop-account question.

## Role changes are refused across the desktop/mobile boundary — client-side only

`updatePersonRole` throws before the request if the target role isn't in
the same category (desktop↔desktop or mobile↔mobile) as the current one.
This is **not** a new server constraint — `users_update_owner`'s own
`with check (app.is_owner())` has no column-level restriction on `role`,
confirmed by reading the policy text directly (unchanged since Phase 1).
The guard exists because the consequence of *not* having it is a broken
account, not a security gap: a PIN account promoted to a desktop role
would have no password; a password account demoted to a PIN role would
have a synthetic `mobile.<id>@pin.fleet-ops.invalid` address and no PIN.
Neither has a recovery path in this app. Stated limitation, not silently
allowed and not falsely claimed as server-enforced.

## Nobody can edit their own row in Settings

Not a SPEC requirement — a stated, deliberate safety default so an
Owner/Admin can't suspend or reassign themselves out of their own account
by mistake. `PeopleList` disables every control on the signed-in user's
own row; nothing server-side enforces this specifically (`users_update_owner`
would technically permit it), same trust-boundary shape as the
same-category role guard above.

## "Permissions" has no separate control surface

Confirmed by reading the schema directly: there is no `permissions` or
`role_permissions` table anywhere in this database. A person's role *is*
their permission set, fully expressed in ~90 RLS policies already built
across every prior phase. Settings' "permissions" is therefore a static
explanatory block (SPEC section 1's own role descriptions, reused
verbatim), not another configuration screen — there is nothing left to
configure once a role is assigned.

## What wasn't proven live

Every Owner-only action (create person, provision, reset PIN, status/role
change) is verified only via a SQL transaction+rollback test confirming
Fleet Manager is blocked on both `INSERT` and `UPDATE` against `users` —
the same "never use the real Owner/Admin account for testing" limitation
Phase 10 hit for `cash_reservations`. The underlying mechanisms
(`admin_reset_pin`, `admin-provision-mobile-account`) were already fully
built and verified end-to-end in Phase 2 (decision 0007) under real
Owner/Admin testing at the time; this phase only adds a UI in front of
them, unchanged.

## A live incident during this phase's own verification

Mid-verification, the Browser pane's persisted session resolved to the
real Owner/Admin account ("Al") instead of the QA Fleet Manager session
that had been active moments earlier — not something this phase's code
caused, a stale `localStorage` auth token surviving across dev-server
restarts in the same browser profile used throughout this whole project.
No action was taken under that identity: caught on the first screen read,
the stored Supabase session was cleared and a fresh QA sign-in performed
before continuing. Recorded here because it's the second time this exact
failure mode has happened in this project (the first is noted in the
session history around Phase 9) — worth a standing habit of checking
*who* a freshly-loaded session belongs to before acting, not just
trusting that the last sign-in call is still what's active.

**Revisit this when:** a real desktop-account self-service flow is
explicitly requested (would need its own Edge Function, mirroring
`admin-provision-mobile-account`'s shape but using `admin.generateLink`+
`verifyOtp` or a real invite email instead of a synthetic address); or a
genuine need arises to convert someone across the desktop/mobile boundary
without recreating their account by hand.
