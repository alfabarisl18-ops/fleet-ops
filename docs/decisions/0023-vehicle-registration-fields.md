# 0023 — Vehicles gain VIN, engine number, cubic capacity, seat count, registration category

**Decided:** 2026-09-02 · **Status:** accepted

## What changed

`public.vehicles` gains 5 new nullable columns: `vin`, `engine_number`,
`cubic_capacity_cc`, `seat_count`, `registration_category`. One migration,
`20260902200258_vehicle_registration_fields.sql`, adds the columns plus two
check constraints (`cubic_capacity_cc > 0`, `seat_count >= 0`, both `or
null`), and extends `apply_correction()`'s VEHICLE allow-list with the same
5 columns so a typo in one of them can actually be corrected through the
normal flow. `AddVehicleForm`, the Identity card, and
`RequestVehicleCorrectionForm` on `VehicleProfileScreen` all gained the 5
fields in the same relative position (after Color/Plate, before
Distinguishing marks).

## Why

The user photographed 6 Sierra Leone Vehicle Registration Cards for real
vehicles being added to the fleet and asked to pre-fill the vehicle Identity
section from them. The cards carry VIN, engine number, cubic capacity, seat
count, and a registration category (C3/D1/E3-style) — none of which
`vehicles` had a column for. Confirmed by a repo-wide search this was
genuinely missing, not overlooked: SPEC.md only anticipates this shape of
data for the Future-Purchases acquisition pipeline
(`purchase_goals`/`transit_records`), and `onboard_vehicle()`'s own comment
explains why that data deliberately never gets copied onto `vehicles` —
avoiding a duplicate source of truth for a vehicle that arrived through that
pipeline. A vehicle added directly (`AddVehicleForm`) never goes through
that pipeline at all, so it had nowhere to put this data.

## Design choices

- **Owner name/address excluded.** Confirmed with the user — not needed for
  vehicles already registered to the business.
- **`engine_number` is `text`, not `integer`.** The 6 cards show both purely
  numeric (`112`, `616`) and alphanumeric (`210D`, `602147891`) values.
- **`registration_category` is free text, not a new enum.** Only
  `C3`/`D1`/`E3` have been seen so far; Sierra Leone's DVLA category codes
  aren't exhaustively known, and a free column avoids a migration every time
  a new one shows up. This is a different axis than `vehicle_type`
  (`LONG_SPRINTER`/`SHORT_SPRINTER`/etc., which already existed) — a
  registration category is what the DVLA card prints, not the fleet's own
  operational classification.
- **`apply_correction()` allow-list extended in the same migration** as the
  new columns, not deferred. Adding fields to the Add form without a
  correction path for them would be a dead end the first time someone needs
  to fix one.

## The 6 real vehicles

Entered through the app (Add Vehicle), not raw SQL — discovered live that a
direct `INSERT INTO vehicles` is actually impossible outside a real
authenticated session: `activity_after_vehicle_insert()` writes a
`VEHICLE_ADDED` activity_records row via `app.current_user_id()`, which
resolves through `auth.uid()` and is null under a service-role SQL
connection. This is the append-only audit trail working as intended, not an
inconvenience to route around.

Long vs. short was decided by `entered_service_on` (the card's "Date of
first registration"), not manufacture year: the 2 oldest dates are Long
Sprinter, the 3 most recent are Short Sprinter, confirmed with the user.
Fleet IDs continue the existing numbering found in production (`SPR-01..06`,
`TRK-01`) → `SPR-07..11`, `TRK-02`.

**Revisit this when:** a registration category outside C3/D1/E3 needs
validating against a known list, or vehicles start needing make/model/year
captured too (deliberately out of scope here — not on the approved field
list).
