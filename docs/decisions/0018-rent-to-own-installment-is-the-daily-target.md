# 0018 — Rent-to-own: the installment *is* the daily target

**Decided:** 2026-08-18 · **Status:** accepted

SPEC open question 2 ("is the installment separate from the daily payment,
or does the daily payment count toward the purchase?") is answered.
**Confirmed with the user:** once a driver-purchase agreement is set up,
the vehicle's daily payment target becomes the installment. The
collector's ordinary "what happened that day?" entry *is* how the
installment gets collected — there is no second, separate
installment-collection flow, and Collections & Finance sees no new
screen. Two follow-ups, also confirmed directly:

- **Every shortfall becomes driver debt while an agreement is active** —
  Full Day, Half Day, Breakdown, all of them. The accepted-loss exception
  (normally: only a Full Day shortfall becomes debt) is suspended for
  that vehicle. The user's own words: *"they're totally responsible for
  it... if it is a half day, it was [not] possible for it at that
  point"* — an installment is owed regardless of why the driver came up
  short.
- **Weekly and Monthly agreements divide evenly into a daily figure**
  (weekly ÷ 7, monthly ÷ days in that calendar month, integer division —
  a stated rounding choice, not exact to the leone over a period).
- **On payoff, the vehicle retires.** *"Once the ownership is
  transferred... it becomes retired... the vehicle is no more active
  working."* Completing an agreement archives the vehicle the same way
  any other status change does — through `vehicle_status_events`, never a
  direct column write (decision 0006).

## `shortfall_treatment` keeps its `GENERATED ALWAYS` guarantee — it just depends on one more fact

Decision 0003 built `shortfall_treatment` as a `GENERATED ALWAYS ...
STORED` column specifically so no code path could ever set it directly.
This phase extends its expression rather than working around it:

```sql
case
  when received_amount_minor >= expected_amount_minor then null
  when under_active_agreement then 'DRIVER_DEBT'
  when day_outcome = 'FULL_DAY' then 'DRIVER_DEBT'
  else 'ACCEPTED_LOSS'
end
```

`under_active_agreement` is a new same-row snapshot column, filled by the
same trigger (`app.daily_payment_before_insert()`) that already
snapshots `expected_amount_minor` — what mattered is what was true that
day. Changing a generated column's expression requires dropping and
re-adding it; the dependent partial index came off first and back on
after. Every historical row defaults `under_active_agreement = false` and
recomputes to exactly the value it already had — confirmed directly
against production data (one `ACCEPTED_LOSS` row, two rows with no
shortfall, all unchanged) rather than assumed.

## Setting up an agreement is one RPC, not two client calls

`set_up_driver_purchase_agreement` inserts the agreement and updates
`vehicles.expected_daily_amount_minor` in the same transaction — the
previous `createAgreement` was a plain insert with no effect on the
vehicle's target at all, which would have made this whole design a no-op.
Completing (`complete_driver_purchase_agreement`) and cancelling
(`cancel_driver_purchase_agreement`) are new; neither existed before this
phase. Cancelling deliberately does **not** restore the vehicle's
previous target — closing a real, independent pre-existing gap
(`expected_daily_amount_minor` had no edit path anywhere in the app,
set once at onboarding) was necessary regardless, via a new
`updateExpectedDailyAmount` and a `VehicleProfileScreen` panel matching
the existing yearly-target one.

## A bug the test suite caught, then a bug I caught myself the same way

`complete_driver_purchase_agreement` and `cancel_driver_purchase_agreement`
were first written relying only on RLS (`dpa_update_desktop`) with no
in-body role check. Before running anything, this was corrected to match
`override_shortfall_treatment`/`forgive_driver_debt`'s existing pattern —
explicit `coalesce(app.is_desktop(), false)` checks — in a follow-up
migration, deliberately coalescing from the start rather than repeating
the null-unsafe-negation bug this project has now hit twice
(`forgive_driver_debt`, debt-forgiveness) and fixed once before that
(`20260810010924_fix_null_unsafe_role_negation.sql`). `npm run test`
confirms both functions are now recognized as safe by the project's own
`db.test.ts` guard-pattern check.

## A real RLS gap, found only by testing live as the actual mobile role

SQL verification and desktop-role testing both passed cleanly first try.
Live testing as F. Kamara (Collections & Finance) surfaced a real bug:
`driver_purchase_agreements` has exactly one SELECT policy,
`dpa_select_desktop`, gated to Owner/Admin and Fleet Manager only.
Collections & Finance has no read access to that table at all — so the
mobile day-outcome screen's `fetchOpenAgreementForVehicle` call silently
returned nothing, and the "this becomes debt regardless of outcome"
warning never appeared, even with a real active agreement. Fixed with a
new SECURITY DEFINER function, `vehicle_has_active_purchase_agreement`,
granted to `authenticated` — it answers the one yes/no question the
mobile screen needs without granting any broader visibility into
agreement amounts, driver identity, or terms, which stay desktop-only.
This is exactly the kind of gap that only live-as-the-actual-role testing
finds; a Fleet Manager or Owner/Admin session would never have hit it.

## What was proven, and how

- **SQL, transaction + rollback, against `SPR-TEST-99` (real hosted
  data, rolled back, nothing kept):** all three payment frequencies
  compute the correct daily-equivalent; a Half Day shortfall under an
  active agreement produces `DRIVER_DEBT` where it would previously have
  been `ACCEPTED_LOSS`; completing an agreement archives the vehicle and
  marks it `COMPLETED`; cancelling leaves the vehicle's target untouched
  (confirmed by reading it back before the next test step, not assumed).
- **Live, as the real QA roles, on the same test vehicle (kept, not
  rolled back — flagged for cleanup below):** as M. Sesay, set up a Daily
  agreement — the daily-equivalent preview and the resulting target both
  showed `SLE 800` correctly; as F. Kamara, recorded a Half Day with a
  Breakdown cause and `SLE 300` received — the debt-warning banner showed
  the live target, the record saved, and the database confirms
  `shortfall_treatment = DRIVER_DEBT` and a new `SLE 500` `OPEN` balance;
  back as M. Sesay, the vehicle profile's "Paid so far" / "Remaining"
  updated to `SLE 300` / `SLE 9,700`.
- **Not proven live:** completing an agreement (archiving a vehicle) was
  deliberately left to the SQL transaction+rollback test only. Doing it
  live against `SPR-TEST-99` would have archived it with no supported
  undo path in the app itself — a real, one-way action, unlike every
  other step above which stays reversible (cancel an agreement, edit a
  target, forgive nothing was touched). The SQL test already confirms the
  mechanism end to end.

## Test data left on `SPR-TEST-99`

Live verification used the already-flagged `SPR-TEST-99` test vehicle
(from Phase 10, never cleaned up) rather than a real vehicle. It now
carries: Mohamed Conteh assigned as current driver, an open `SLE 10,000`
Daily agreement (target `SLE 800`), one `HALF_DAY` record with a
`SLE 500` open driver-debt balance. None of this is real. Bundling this
with the still-outstanding Phase 10 cleanup (the "Fourth Sprinter" test
goal and this same vehicle) is worth doing in one pass — I have the
DELETE SQL ready whenever you want it, same as before.

**Revisit this when:** a real driver-purchase agreement runs long enough
in production to test whether integer-division rounding on Weekly/Monthly
installments visibly under-collects over many months (a few leones per
period, compounding); or if a future need arises to link a daily payment
back to the specific agreement it's an installment on (currently
inferred only by "is there a non-cancelled agreement on this vehicle
right now", not stored per-payment).
