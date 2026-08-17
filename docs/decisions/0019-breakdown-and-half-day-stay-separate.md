# 0019 — Breakdown and Half Day stay separate, unchanged

**Decided:** 2026-08-18 · **Status:** accepted

SPEC open question 6 ("should breakdown simply be a cause under Half Day,
with the separate Breakdown option reserved for a vehicle that never
worked at all?") is answered. **Confirmed with the user: no change.**

## What was actually being asked

`day_outcome` has always had both `HALF_DAY` (with `shortfall_cause`
including `BREAKDOWN` as one of four options) and a separate top-level
`BREAKDOWN` outcome, since Phase 1's schema. SPEC.md's own day-outcome
table (section 5) describes them almost identically in effect — both an
accepted shortfall, no driver debt, no unpaid balance against the
target — differing mainly in which fields the mobile screen shows (Half
Day always asks for a cause from four options; Breakdown just asks the
amount received, since breakdown is already the given reason). The
question was whether this overlap is redundant enough to collapse: fold
`BREAKDOWN` entirely into Half Day's cause list, or narrow standalone
`BREAKDOWN` to mean "worked zero of the day" (parallel to `DID_NOT_WORK`)
so a partial-day breakdown could only ever be entered as Half Day.

## Why leave it as-is

Both options have been live and in real use since Phase 1 with no
reported confusion from the field — the strongest evidence available
that the apparent redundancy isn't actually costing anyone anything day
to day. Changing it now would touch the `day_outcome` enum's meaning
(a value collectors already recognize), the mobile day-outcome screen's
copy, and — if `BREAKDOWN` were removed as a top-level outcome entirely
— every historical row recorded with it, for a distinction that was
never reported as confusing in practice. Leaving it alone is the
zero-risk option, and the one the user chose directly when asked.

**Revisit this when:** a collector or the Owner actually reports
confusion between the two in the field — the kind of concrete signal
this decision explicitly notes has never shown up so far.
