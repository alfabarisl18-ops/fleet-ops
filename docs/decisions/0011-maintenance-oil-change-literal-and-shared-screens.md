# 0011 — Maintenance: the Oil Change literal, and one pair of screens for both roles

**Decided:** 2026-08-13 · **Status:** accepted

Phase 1 built `maintenance_orders`, `maintenance_status_events` (which
drives `maintenance_orders.status`/`is_grounded`/`closed_at` via a
`SECURITY DEFINER` trigger, line-for-line the `vehicle_status_events`
pattern — decision 0006), `maintenance_parts`, and `maintenance_notes`
with schema, RLS, and grants already in place. Nothing had ever written
to them until this phase.

**Scope, already answered by SPEC itself, not guessed:** the desktop
dashboard's "Recorded Cost" card is described as "opening analytics ...
linked to Accounting" — the same deferral already used once (Phase 4
built the Records spine but left `ledger_entries` without a UI until
Phase 5 wrote to it). This phase shows a running total; the breakdown
(parts vs labour, cost by vehicle, most-replaced parts) is Phase 8's job.

**`service_area = 'OIL_CHANGE'` is a literal sentinel string, not a
label.** `service_area`/`work_action` are free `text` by design (SPEC
names vehicle areas only by example), but two check constraints —
`mo_oil_change_is_regular_service` and `mo_oil_change_sets_work_action`
— compare `upper(btrim(service_area))` against the literal `'OIL_CHANGE'`
(underscore, not a space). A first verification pass used the
human-readable `'Oil Change'` and the constraint silently didn't fire —
not a schema bug, a test-data mistake, confirmed by re-running with the
literal and watching both constraints correctly reject/require. The UI
implication: `AddMaintenanceOrderForm`'s "Oil Change" option is a
checkbox preset under Regular Service, not a free-text value — checking
it sets both `service_area` and `work_action` to the literal string
programmatically; the free-text Area field is hidden while it's checked.

**One pair of screens serves both roles.** `AddMaintenanceOrderForm` and
`MaintenanceOrderDetailScreen` are used by both `DesktopWorkspace` and
the new `MaintenanceWorkspace` (mobile) — same fields, same actions, for
both `is_desktop()` and `is_maintenance()` callers, matching what RLS
already allows both roles to do. The one desktop-only action
(`old_parts_returned`) is gated on `currentUserRole`, the same pattern
`DriverProfileScreen`'s delete action already uses. `onOpenVehicle` is
optional on the detail screen specifically so mobile (which has no
vehicle profile screen) renders the fleet ID as plain text instead of a
button that does nothing when tapped.

**`record_maintenance_part` was written `SECURITY DEFINER` from the
start**, citing Phase 5's `apply_daily_payment_effects` bug directly:
`maintenance_parts` has `mp_update_desktop` (desktop-only `UPDATE`), the
exact shape that bug hid in, so a plain `SECURITY INVOKER` link-back of
`ledger_entry_id` would have silently affected zero rows for a
Maintenance & Repairs submission. Verified live specifically for that
role, not assumed from the SQL-level test alone (which ran under
Owner/Admin — see the next paragraph for why).

**Mobile-role SQL verification has a real limitation, worked around, not
solved.** `app.current_user_id()` and `app.is_maintenance()` for mobile
roles require a live `public.sessions` row (decision 0007) — something
only a real PIN sign-in creates. Simulated `set_config` claims are
sufficient for negative-path tests (RLS denial looks the same whether
the session gate or the role fails) but not for positive-path ones: a
first attempt to test as Maintenance & Repairs via simulated claims
failed with `is_maintenance()` resolving to `null`. Schema/constraint/
projection verification ran as Owner/Admin instead (a desktop role,
satisfying every condition `is_maintenance()` would, without the
session-gating complication); genuine mobile-role RLS and the
`SECURITY DEFINER` fix were proven live instead, through a real PIN
sign-in as I. Turay (Maintenance & Repairs QA account).

**Revisit this when:** Phase 8 builds the real Recorded Cost analytics
breakdown, or if a future phase needs to test a mobile-role positive
path at the SQL level often enough that a scripted "create a real
session row" test helper becomes worth building.
