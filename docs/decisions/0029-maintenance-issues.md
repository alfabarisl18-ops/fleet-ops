# 0029  - A maintenance order owns ordered issues

Decision: add `maintenance_issues` so one maintenance order can record several
areas and problems or work actions. Order-level status, handler, vehicle
condition, notes, photos, parts and reminders remain on `maintenance_orders`.
The `create_maintenance_order` RPC validates and inserts the parent and all
issues in one transaction, with client IDs on both levels for safe offline retry.

Existing orders are backfilled as one issue. During rollout, the first issue is
also mirrored into the legacy singular order columns and an old-client insert
trigger creates its issue. This expansion-first approach lets the schema be
applied before the new staging bundle without breaking the currently deployed
client. The legacy columns and trigger are removed only after production code is
verified in a later cleanup migration.

Oil Change remains available only for Regular Service and can coexist with other
service issues. Problem Reported requires a descriptor per issue. PostgreSQL
checks these rules for every issue, and Collections & Finance has no access.

Revisit the order/issue boundary only if parts or photos need to attach to a
specific issue rather than the whole maintenance visit.

## Sources

- SRC-TRIP-MAINTENANCE-20260916-USER in ../sources.md: approved behavior.
- SRC-TRIP-MAINTENANCE-20260916-REPO: migration 20260916130000 and maintenance screens/data layer.
