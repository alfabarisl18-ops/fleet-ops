# 0025 — Assignment route updates vehicle information

User decision, 2026-09-07: selecting a route while assigning a driver updates
the vehicle route in the same transaction. Both forms default to the vehicle
route; None clears it. Existing history is preserved. Retries reuse a client
record ID and return the original assignment before closing any newer history.
An advisory transaction lock serializes assignment changes; existing desktop
RLS and an explicit role check enforce permissions.

Local verification uses tools/test-database.cjs with a temporary PGlite runtime,
real repository migrations/RLS, and platform auth/storage/cron scaffolding.
No hosted SQL has been applied.

## Sources

SRC-OPERATIONS-20260907-USER in ../sources.md: approved implementation plan.
Code baseline: 94fe6e6, assign_driver_to_vehicle and both assignment forms.
