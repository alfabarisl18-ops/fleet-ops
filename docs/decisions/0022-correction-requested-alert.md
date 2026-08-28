# 0022 — CORRECTION_REQUESTED becomes a real alert, not just a Records entry

**Decided:** 2026-08-28 · **Status:** accepted

## What changed

`public.alerts` gains a 22nd type, `CORRECTION_REQUESTED`, raised whenever
someone who isn't Owner/Admin requests a correction on a vehicle or driver,
and resolved automatically once that correction is approved or rejected.
Two new migrations: `20260828193040_correction_alert_type.sql` (the enum
value — split into its own migration since `ALTER TYPE ... ADD VALUE`
cannot be used in the same transaction that also uses the new value) and
`20260828193105_correction_alerts.sql` (the two triggers).

## Why

Found live: the user asked why no bell alert fired for a test correction
request and — correctly — expected one. Alerts only ever covered a fixed,
deliberate list of 21 situations (decision 0012); "someone requested a
correction" was never one of them, so it only ever showed on the Records
page. Once a real Fleet Manager (Zainab) starts using the app, a pending
correction only the Owner/Admin can approve or reject could otherwise sit
unnoticed indefinitely — a real gap, not a hypothetical one.

## Design choices

- **Event-driven, not cron.** A correction request has one clear
  triggering event (the insert) and one clear resolving event (the status
  change) — no date-driven condition to periodically re-check, matching
  decision 0012's own "ask trigger-vs-cron fresh per type."
- **Subject reuses `VEHICLE`/`DRIVER` directly** — `corrections.target_table`
  is already one of those two `entity_type` values, and `subject_id =
  target_id` is exactly the same shape `VEHICLE_BELOW_TARGET` (decision
  0013/Phase 8) already uses to point an alert straight at a vehicle. No
  new `entity_type` value needed, only the one `alert_type` value.
- **`visible_to_roles = ['OWNER_ADMIN']` only**, not Fleet Manager too —
  unlike most other alerts (which both desktop roles can act on), only
  Owner/Admin can call `apply_correction()`/`reject_correction()`
  server-side. A Fleet Manager already knows they just submitted the
  request; notifying them again would be noise, not "whoever can act on
  this."
- **Owner/Admin's own request is deliberately excluded.** `CorrectionPanel`
  already auto-applies an Owner/Admin's own edit a moment after it's
  requested (this session's earlier "Owner/Admin sees 'Edit', not 'Request
  a correction'" change) — it is never genuinely pending long enough for
  an alert to mean anything, so raising one would just be a flash of noise
  that resolves itself instantly.

**Revisit this when:** a role other than Owner/Admin ever gains the
ability to approve/reject a correction — at that point `visible_to_roles`
needs to grow to match, the same way `UNUSUAL_EXPENSE`/`DISPUTED_EXPENSE`
already include both desktop roles.
