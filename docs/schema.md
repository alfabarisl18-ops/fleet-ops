# Database schema

31 tables in `public` (plus 2 in `app_private`: PIN credentials and the
role-scoped PIN throttle — neither reachable over the API, see "Where the
private things live" below), 37 enum types, 2 composite return types,
146 indexes, 90 row-level-security policies, 90 check constraints,
41 triggers, 18 `app` helper functions, 6 `public` functions, across
17 migrations. Counted from the live schema on 2026-08-10.

Everything here is created by the migrations in `supabase/migrations/`. Nothing
was applied by hand.

---

## How to read this

Four things are true of every table in `public`, and the guards migration
(`20260808232711_guards.sql`) fails the build if any of them stops being true:

1. Row level security is enabled.
2. At least one policy exists.
3. `client_record_id` exists with a single-column unique index — except
   `sessions` and `audit_log`, which only the server writes.
4. Every `*_minor` column is an integer type.

`anon` holds no privilege anywhere. Not signed in means not a single row.

---

## Table summary

| Table | Cols | Idx | Policies | Triggers | Checks | FKs |
|---|---:|---:|---:|---:|---:|---:|
| acquisition_cost_lines | 9 | 4 | 3 | 0 | 2 | 2 |
| acquisition_payments | 16 | 4 | 3 | 3 | 5 | 4 |
| activity_records | 13 | 8 | 3 | 2 | 1 | 3 |
| alerts | 16 | 8 | 3 | 1 | 4 | 4 |
| audit_log | 8 | 3 | 1 | 0 | 0 | 1 |
| balance_settlements | 8 | 3 | 2 | 3 | 1 | 3 |
| bundled_payments | 12 | 4 | 2 | 4 | 2 | 3 |
| cash_reservations | 9 | 3 | 3 | 1 | 2 | 3 |
| corrections | 12 | 4 | 4 | 1 | 1 | 2 |
| daily_payment_records | 21 | 7 | 3 | 3 | 8 | 6 |
| documents | 11 | 5 | 4 | 1 | 3 | 1 |
| driver_assignments | 8 | 5 | 3 | 1 | 1 | 3 |
| driver_credits | 8 | 3 | 3 | 1 | 3 | 2 |
| driver_purchase_agreements | 11 | 4 | 3 | 0 | 3 | 2 |
| drivers | 22 | 5 | 3 | 0 | 3 | 0 |
| ledger_entries | 20 | 11 | 7 | 4 | 6 | 5 |
| maintenance_notes | 6 | 3 | 2 | 2 | 1 | 2 |
| maintenance_orders | 22 | 7 | 3 | 2 | 8 | 3 |
| maintenance_issues | 8 | 4 | 3 | 1 | 2 | 1 |
| maintenance_parts | 11 | 4 | 3 | 2 | 3 | 3 |
| maintenance_status_events | 8 | 3 | 2 | 3 | 0 | 2 |
| outstanding_balances | 12 | 6 | 3 | 2 | 4 | 3 |
| planned_vehicles | 9 | 5 | 3 | 0 | 1 | 2 |
| purchase_goals | 23 | 3 | 3 | 0 | 5 | 2 |
| routes | 6 | 3 | 3 | 0 | 1 | 0 |
| savings_targets | 11 | 3 | 3 | 0 | 6 | 1 |
| sessions | 5 | 2 | 1 | 0 | 1 | 1 |
| transit_records | 20 | 4 | 3 | 0 | 2 | 1 |
| trips | 17 | 5 | 3 | 2 | 4 | 3 |
| users | 9 | 6 | 3 | 0 | 3 | 2 |
| vehicle_status_events | 8 | 3 | 2 | 3 | 0 | 2 |
| vehicles | 21 | 8 | 3 | 0 | 6 | 2 |

---

## Permission matrix

Verified against the live database by signing in as each role and attempting
each action. `denied` means Postgres refused; `none` means the query succeeded
and returned zero rows because every row was filtered away.

| Action | Owner/Admin | Fleet Manager | Collections & Finance | Maintenance & Repairs | Not signed in |
|---|---|---|---|---|---|
| Read the fleet list | yes | yes | yes | yes | **denied** |
| Read drivers | yes | yes | yes | yes | denied |
| Read driver ID / licence images | yes | yes | **denied** | **denied** | denied |
| Read maintenance orders and issues | yes | yes | **none** | yes | denied |
| Read purchase goals | yes | yes | **none** | **none** | denied |
| Read the audit log | yes | **none** | **none** | **none** | denied |
| Write the audit log | **denied** | **denied** | **denied** | **denied** | denied |
| Record a daily payment | yes | yes | yes | **denied** | denied |
| Record income | yes | yes | yes | **denied** | denied |
| Record a parts expense | yes | yes | yes | yes | denied |
| Open a maintenance order with issues | yes | yes | **denied** | yes | denied |
| Append a missing trip cost | yes | yes | **denied** | **denied** | denied |
| Ground a vehicle | yes | yes | **denied** | yes | denied |
| Change a payment target | yes | yes | **denied** | **denied** | denied |
| Reserve business cash | yes | **denied** | **denied** | **denied** | denied |
| Create a user account | yes | **denied** | **denied** | **denied** | denied |
| Record a payment as another user | **denied** | **denied** | **denied** | **denied** | denied |
| Read the mobile-role roster (unused by sign-in; see note) | yes | yes | yes | yes | **yes** |

Three entries deserve a note.

**Fleet Manager cannot create user accounts.** SPEC section 1 gives Owner/Admin
"manages people, roles, PINs, permissions" and says Fleet Manager "cannot create
administrators, change the Owner account, or control system security". It does
not say what Fleet Manager may do with ordinary accounts, so deny-by-default
answers it: read only. Loosening this later is one policy.

**Nobody may attribute a record to another user.** Every insert policy requires
`entered_by = app.current_user_id()`, so a compromised client cannot forge who
entered a payment.

**The roster is the one deliberate exception to "not signed in means not a
single row."** `public.mobile_role_roster(role)` is callable by `anon` —
built in Phase 2 for a name-picker sign-in step that was tested working, then
replaced: told directly that the two mobile roles don't need that much
ceremony, sign-in became role + PIN only, no name selection (see
[decision 0007](decisions/0007-pin-sign-in-becomes-a-real-session.md)). The
function itself, and its `anon` grant, are untouched — nothing currently calls
either, but both stay correct and available for a future screen that already
knows which account it's looking at. It was never a table grant and does not
touch the guarantee the guards migration actually enforces: `anon` still holds
zero privilege on every table in this database. The function returns exactly
two columns — `id` and `display_name` — for `status = 'ACTIVE'` users of
exactly the two mobile roles; it structurally cannot return an Owner/Admin or
Fleet Manager row, a phone number, an email, or anything else.

---

## The rule that trips people up

For ordinary vehicles, a shortfall becomes **driver debt** only when the vehicle worked a **Full Day**.

This is not application logic. `daily_payment_records.shortfall_treatment` is a
`GENERATED ALWAYS ... STORED` column:

```sql
shortfall_treatment public.shortfall_treatment
  generated always as (
    case
      when received_amount_minor >= expected_amount_minor then null
      when day_outcome = 'FULL_DAY' then 'DRIVER_DEBT'::public.shortfall_treatment
      else 'ACCEPTED_LOSS'::public.shortfall_treatment
    end
  ) stored
```

Postgres rejects any attempt to supply it, from any client, with any credential:

```
cannot insert a non-DEFAULT value into column "shortfall_treatment"
```

Verified behaviour, SPR-01 at SLE 900/day:

| Day outcome | Received | Shortfall | Treatment |
|---|---|---|---|
| Full Day | SLE 600 | SLE 300 | `DRIVER_DEBT` |
| Half Day (checkpoint) | SLE 400 | SLE 500 | `ACCEPTED_LOSS` |
| Breakdown | SLE 0 | SLE 900 | `ACCEPTED_LOSS` |
| Did Not Work | SLE 0 | SLE 900 | `ACCEPTED_LOSS` |

Management review is a separate, nullable `shortfall_treatment_override` column
restricted to the desktop roles, so the original derivation and the decision to
depart from it both survive. A collector cannot forgive a debt or invent one.

---

## Business dates

`app.freetown_today()` returns `(now() at time zone 'Africa/Freetown')::date`.

Every business date column defaults to it, and a trigger rejects any business
date after it. Omit the column and the server fills it in. There is no code path
that turns a device clock into a business date, and `new Date()` is blocked by
an ESLint rule.

Event timestamps (`entered_at`, `changed_at`, `uploaded_at`, `opened_at`,
`requested_at`) are `timestamptz` and are overwritten by trigger on insert, so a
device cannot supply one at all.

---

## Money

`bigint` minor units — SLE x 100 — everywhere. Never float, never numeric.

`int4` tops out at SLE 21,474,836.47, which one imported vehicle or a
multi-vehicle savings target can exceed. `bigint` costs four extra bytes per
column and removes the question; values stay far below 2^53, so they survive
JSON as exact JavaScript numbers.

`ledger_entries.amount_minor` is always positive and `direction` carries the
sign. Expenses render as `−SLE 1,000` at the render layer, never in storage.

The one `numeric` column in the database is
`acquisition_payments.exchange_rate`, which is a rate and not an amount. The SLE
figure it produced is stored beside it as an integer.

---

## Append-only money

`app.enforce_append_only()` blocks every delete and every update to any column
not on an explicit allow-list, on `ledger_entries`, `daily_payment_records`,
`bundled_payments`, `balance_settlements`, `driver_credits`,
`outstanding_balances`, `acquisition_payments`, `maintenance_parts`,
`maintenance_notes`, `activity_records` and both status-event tables.

The allow-lists are narrow and hold only review metadata — reconciliation flags,
approval state, the pointer to a superseding entry, the remaining amount on a
balance as settlements come in. Amounts, dates, direction, category, vehicle and
driver are frozen from the moment the row is written.

`outstanding_balances` additionally cannot increase. Owing more means a new
balance row, not a bigger one.

---

## Status is an event, not a column

`vehicles.status` and `maintenance_orders.status` are projections. Writing them
directly is not how status changes: you insert a `vehicle_status_event` or a
`maintenance_status_event`, and a trigger reads the current status into
`from_status`, stamps the server time and the acting user, refuses a no-op
transition, and applies the new status to the parent row.

The trigger is `SECURITY DEFINER`, which is what lets the mobile Maintenance &
Repairs role move a vehicle Grounded ↔ Active without holding `UPDATE` on
`vehicles`.

---

## Offline safety

Every table a device writes to has `client_record_id uuid not null unique`,
generated on the phone before the write. A retried sync is idempotent.

`daily_payment_records` additionally has `unique (vehicle_id, service_date)`.
Two collectors recording the same vehicle-day collide there and become a flagged
duplicate for review, never a silent overwrite.

---

## Where the private things live

| | |
|---|---|
| `app` | RLS helper functions and trigger functions. Not an exposed schema. |
| `app_private.user_pin_credentials` | Bcrypt PIN hashes, one row per mobile-role account. No grants to any client role, RLS enabled with no policies, not an exposed schema. |
| `app_private.role_pin_throttle` | One row per mobile role — the shared 5-attempt/15-minute lockout counter `public.verify_role_pin` uses since it has no account to blame a wrong guess on until one matches. Same lockdown as `user_pin_credentials`. |
| `public.driver_identity_images(uuid)` | The only route to a driver's ID and licence image keys. Raises for both mobile roles. |
| `public.verify_pin(uuid, text)` / `public.verify_role_pin(user_role, text)` | PIN comparison, `service_role` only. The plaintext PIN reaches one of these and goes no further. `verify_role_pin` is what `pin-sign-in` actually calls; `verify_pin` is the per-account version it replaced, kept because it's still correct and may serve a future screen that already knows the account. |

`supabase/config.toml` exposes `public` only. Adding `app` or `app_private` to
that list would put the PIN hashes on the public API.

---

## Two advisor warnings, both intentional

`supabase` reports:

- `app_private.user_pin_credentials` has RLS enabled but no policies. That is
  the point — deny everything to everybody. Only the service role reaches it.
- `public.driver_identity_images` is a `SECURITY DEFINER` function callable by
  signed-in users. Also the point: it is definer precisely so it can read
  columns the caller cannot, and it checks `app.is_desktop()` before returning
  anything.


## Purchase policy and Service update

Sources: SRC-OPERATIONS-20260907-USER and SRC-OPERATIONS-20260907-REPO
in sources.md; implementation migrations 20260907170000 through 20260907174000.
See decisions 0025–0027. Hosted execution remains pending approval.

- Agreement snapshots: `schedule_effective_on`, `schedule_daily_amount_minor`,
  `schedule_baseline_on`, `schedule_closed_progress`. Original agreed end unchanged;
  closed progress freezes the display. Existing open agreements activate on migration
  day (or future start), without pre-policy missing-day penalties.
- Daily snapshots: `purchase_agreement_id`, `defer_installment`. Generated treatment
  adds `DEFERRED_INSTALLMENT`; old rows remain on their original treatment.
- Ledger allocation: `purchase_agreement_id`, `purchase_applied_minor`; excludes
  held advances/unrelated debt. Append-only originals remain. Approved purchase
  corrections may append zero-valued superseding entries, not cash movements.
- Enums: `SERVICE`, `DEFERRED_INSTALLMENT`, `PURCHASE_PAYMENT`; Service is zero-only.
- RPCs: `vehicle_purchase_payment_context(uuid,date)` exposes only collection context;
  `driver_purchase_progress(uuid)` is management-only;
  `correct_purchase_payment(uuid,uuid,bigint,text)` is Owner/Admin-only, audited,
  idempotent, and limited to new-policy pure installment allocations.
- Existing table RLS remains; explicit function permissions reject missing/expired
  identities. Snapshot triggers disregard caller-supplied policy and allocation.
- Route assignment uses the original RPC signature, a transaction lock and client
  record ID; vehicle and assignment update atomically, preserving transfer history.

Local verification: `node tools/test-database.cjs` uses an isolated PostgreSQL
runtime. It includes an upgrade fixture and equality checks on historical records.
It is not a substitute for Supabase staging/RLS and browser verification.

## Trip expenses and multiple maintenance issues

Sources: SRC-TRIP-MAINTENANCE-20260916-USER and
SRC-TRIP-MAINTENANCE-20260916-REPO in sources.md. See decisions 0028 -0029.
Hosted execution of these expansion migrations remains pending approval.

- `add_trip_expense(uuid,uuid,text,bigint,text)` accepts Fuel,
  Road/checkpoint, Driver pay and Helper pay from Owner/Admin or Fleet Manager.
  It locks and reads the trip, derives vehicle, driver, applies-to date and the
  Freetown receipt timestamp on the server, and appends one ledger expense.
  Reusing the same client record ID returns the same row only when the request
  matches; no ledger row is updated.
- Trip revenue and costs remain separate ledger rows. The detail projection
  sums linked expenses, so SLE 10,000,000 revenue less SLE 750,000 road/people
  costs and SLE 3,250,000 fuel is exactly SLE 6,000,000 net.
- `maintenance_issues` stores one or more ordered issues per maintenance order.
  Each issue owns its area, descriptor and work action. A trigger enforces that
  Problem Reported issues have a descriptor and that Oil Change belongs only to
  Regular Service with the Oil Change action.
- `create_maintenance_order(..., jsonb)` validates every issue and inserts the
  order and all issues atomically. Parent and child client IDs make offline
  retries idempotent; a mismatched retry is rejected. Collections & Finance
  cannot read or create issues. Maintenance & Repairs and desktop roles retain
  their existing maintenance access.
- Existing orders are backfilled as one issue. During the compatibility window,
  the first issue mirrors the legacy singular columns and a trigger supplies an
  issue for inserts made by the older deployed client. Remove those columns and
  compatibility trigger only in a later, separately reviewed cleanup migration.
