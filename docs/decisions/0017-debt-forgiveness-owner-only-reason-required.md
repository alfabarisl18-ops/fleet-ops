# 0017 — Debt forgiveness: Owner/Admin only, a reason is required

**Decided:** 2026-08-16 · **Status:** accepted

SPEC open question 7 ("can a driver's accumulated debt be forgiven, and
does that need Owner approval and a recorded reason?") is answered.
**Confirmed with the user:** yes, Owner/Admin only, and a reason is
required — the schema already made forgiveness *possible*
(`outstanding_balances.status` has a `WRITTEN_OFF` value, only desktop
roles can update a balance at all), but whether it needed Owner-specific
approval and a mandatory reason was still open until now.

## `forgive_driver_debt` — money rows stay append-only, forgiveness is still visible in the books

`public.forgive_driver_debt(p_balance_id, p_reason)`: SECURITY DEFINER,
checked inside the function body (Owner/Admin only) since
`outstanding_balances`' own RLS is broader than this one specific action
— the same shape as `override_shortfall_treatment`. Zeroes
`remaining_amount_minor`, sets `status = 'WRITTEN_OFF'`, and — critically
— inserts an `OTHER_EXPENSE` ledger entry for the forgiven amount when
there was still a balance outstanding, so a forgiven debt doesn't
silently vanish from the accounting; it becomes a recorded loss instead.
`write_off_reason` is required by a table constraint
(`ob_write_off_reason_required`), not just client-side validation:
`(status = 'WRITTEN_OFF') = (write_off_reason is not null)`.

## A bug the project's own test suite caught before it shipped

The first version checked `if not app.is_owner()` — null-unsafe, since
`NOT NULL` is `NULL` in SQL, not `TRUE`. An invalid or expired session
would have silently passed the guard instead of being blocked — the
exact bug class this project already fixed once before
(`20260810010924_fix_null_unsafe_role_negation.sql`). `npm run test`
failed on this immediately via `src/types/db.test.ts`'s guard-pattern
check. Fixed in a follow-up migration
(`20260817020000_fix_forgive_driver_debt_null_check.sql`) rather than
editing the already-applied migration file, matching this project's
migration-history discipline: `coalesce(app.is_owner(), false)`, same as
every other role check in the codebase.

## Three field-reported bugs fixed in the same pass

Reported directly from real device use, alongside approving the
forgiveness design:

- **Invisible date text.** `src/index.css` set `color-scheme: light dark`
  globally, but the app has zero dark-mode styling anywhere. On a phone
  with system dark mode on, the browser rendered native form-control
  chrome (date input text, `<select>` backgrounds) in dark colors while
  every Tailwind-authored background stayed light — white text on a
  white field. This was also the *entire* cause of the separate "dates
  aren't editable" report: the date was there and editable, just
  invisible. Fixed by pinning `color-scheme: light`. Verified live by
  forcing the Browser pane into dark mode and reading `getComputedStyle`
  on both a date input and a `<select>` — both compute light colors
  regardless of the system preference.
- **Maintenance area was a free-text field.** Explicitly: *"I don't want
  no input field."* Replaced with a `<select>` from a new
  `MAINTENANCE_AREAS` constant (`src/data/maintenance.ts`), with an
  "Other" option revealing a follow-up free-text field for anything the
  list doesn't cover. SPEC never actually enumerates vehicle areas — this
  list is a stated default, open to correction, not something SPEC
  specified.

## What was proven, and how

SQL: a transaction test confirming a Fleet Manager session is blocked
from calling `forgive_driver_debt`, and that a null/invalid session is
also blocked (the specific case the null-unsafe bug would have let
through). Live in the Browser pane: the dark-mode color-scheme fix
verified by forcing `colorScheme: 'dark'` and reading computed styles
directly, not just visually; a real maintenance record saved end-to-end
as I. Turay with `service_area = 'Engine'` chosen from the new dropdown.
Owner-only debt forgiveness itself was not exercised live under the
project's own "never use the real Owner/Admin account for testing" rule
— covered by the SQL-level test instead, same limitation every
Owner-only action in this project has hit since Phase 10.

**Revisit this when:** a driver accumulates debt across more than one
vehicle and forgiveness needs to target "everything this driver owes" in
one action rather than one balance row at a time — `forgive_driver_debt`
currently takes a single `p_balance_id`, deliberately, matching how
`outstanding_balances` rows are already listed and acted on individually
everywhere else in the app.
