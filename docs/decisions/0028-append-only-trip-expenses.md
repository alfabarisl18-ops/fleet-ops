# 0028  - Trip costs stay append-only ledger facts

Decision: add Fuel to trip entry and let Owner/Admin and Fleet Manager append a
missing trip cost through a server RPC. Each Fuel, Road/checkpoint, Driver pay or
Helper pay amount is a new ledger expense linked to the trip. The RPC derives the
vehicle, driver and dates from the trip and Freetown server time. It returns the
same row for an identical retried client record ID and rejects a mismatched reuse.

We considered adding editable cost columns to `trips`. That would duplicate the
ledger, allow totals to drift and violate the existing append-only money rule.
Trip detail therefore calculates revenue, costs and net from linked ledger rows.

Revisit only if the ledger/source model itself changes. A correction to a wrong
money row still needs the established superseding-entry workflow; Add missing
cost is for an omitted cost, not an edit.

## Sources

- SRC-TRIP-MAINTENANCE-20260916-USER in ../sources.md: approved behavior.
- SRC-TRIP-MAINTENANCE-20260916-REPO: migration 20260916120000 and accounting screens/data layer.
