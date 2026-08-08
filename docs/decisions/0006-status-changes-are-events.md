# 0006 — Status columns are projections of an event table

**Decided:** 2026-08-08 · **Status:** accepted

Structural rule 7 says vehicle and maintenance status changes are events
recording who changed what and when, not just a column. Both are: `vehicles.status`
and `maintenance_orders.status` are maintained entirely by triggers on
`vehicle_status_events` and `maintenance_status_events`, and are never written
directly.

Inserting an event does four things before the row lands: reads the current
status into `from_status` so a device cannot report a transition that did not
happen, stamps `changed_at` with server time, resolves `changed_by` from the
session rather than trusting the payload, and refuses a no-op transition.

Both trigger functions are `SECURITY DEFINER`. That is what lets the mobile
Maintenance & Repairs role move a vehicle Grounded ↔ Active — SPEC section 6
gives it vehicle-status tools — while holding no `UPDATE` privilege on
`public.vehicles` at all. Its power is exactly "append a status event", which is
narrower and easier to reason about than "update this table but only these
columns and only these values".

Keeping the denormalised column is deliberate: the fleet list header reads
"6 vehicles — 3 active, 2 grounded, 1 in maintenance" on every page load, and
that should not be a window function over an event log.

**Alternatives:** no status column, always derive from the latest event — correct
but slower for the most common query in the product. Application code writing
both — two writes that can diverge.

**Revisit if:** the projection is ever found out of step with its events, which
would mean something wrote the column directly and should be found and stopped.
