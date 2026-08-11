# 0009 — Corrections cover vehicles and drivers now; approve and apply collapse to one action

**Decided:** 2026-08-11 · **Status:** accepted

Phase 1 built the `corrections` table and its `REQUESTED → APPROVED →
REJECTED/APPLIED` workflow, but nothing used it. Phase 3 never built an
"edit vehicle" or "edit driver details" form either — there was, until this
phase, no way to fix a typo in a vehicle's color or a driver's phone number
except raw SQL. SPEC's own rule for the Records page — "no editing here...
corrections go through the authorized workflow" — means that gap wasn't an
oversight to fill with a direct-edit form; corrections *is* the intended
mechanism. Confirmed with the user before building it this way.

**Approve and apply collapse to one user action**, even though the schema
models three states (`REQUESTED`, `APPROVED`, `APPLIED`) as genuinely
distinct. `public.apply_correction()` moves a correction straight from
`REQUESTED` to `APPLIED` in one call — there is no click that leaves a
correction "approved but not yet applied." For a single-approver workflow
(only Owner/Admin ever acts on a correction) the extra state adds a step
with no real decision behind it. Revisit this if a future phase introduces
a second approval tier, batch-apply, or any reason "approved" and "applied"
need to happen at different times.

**Correctable columns are an explicit allow-list**, applied via `CASE WHEN
after_json ? 'col'` in `apply_correction()`, not dynamic SQL — matches
decision 0005's existing preference for allow-lists over reflection.
Vehicles: `plate`, `color`, `distinguishing_marks`, `custom_type`,
`custom_description`, `route_id`, `purchased_on`, `purchase_price_minor`,
`entered_service_on`, `expected_retirement_on`, `fleet_id`. Drivers:
`full_name`, `known_as`, `phone`, `phone_alt`, `address`,
`next_of_kin_name`, `next_of_kin_phone`, `id_document_type`,
`id_document_number`, `licence_number`, `licence_expiry`, `started_on`,
`notes`.

Deliberately excluded: `type`/`current_driver_id` on vehicles and
`status`/`left_on`/`leave_reason` on drivers all have their own dedicated
flows or trigger-maintained semantics already — a field correction isn't
the right layer for them. `expected_daily_amount_minor`/`yearly_target_minor`
belong to Phase 5/8's target-setting, not a typo fix.

**`before_json` is captured server-side**, by a `BEFORE INSERT` trigger
that reads the target row directly, not trusted from the client — same
"server computes what it can" idiom as business dates and
`vehicle_status_events.from_status`.

**A real bug found while verifying this** (see `docs/log.md`): once
`activity_records` started getting a `DRIVER_ADDED` row for every driver,
`activity_records.driver_id`'s original `ON DELETE RESTRICT` (from Phase 1,
before anything populated the table) meant `delete_driver()` would block on
every driver's own "added" record. Fixed by changing that one FK to `ON
DELETE SET NULL` — deleting a driver should detach their activity history,
not erase it or block the delete — and by widening
`activity_records_append_only`'s allow-list to permit that specific
cascade-driven column, since `SET NULL` is implemented as an `UPDATE` even
when the database performs it internally.
