# 0027 — Service is a zero-payment day outcome

Decision: insert Service after Driver's Day in Collections & Finance. It records
zero without an amount field, then Done. Enforce zero in PostgreSQL, including
purchase correction entries referencing a Service day. There is no monthly limit,
maintenance-order creation, or vehicle-status change. Existing eligibility and
box-truck trip entry remain unchanged. Use Half Day when money was received.

Ordinary Service is an accepted loss. New-policy purchase Service is a deferred
installment. Enum creation commits before migrations using the new value.

## Sources

- SRC-OPERATIONS-20260907-USER in ../sources.md: approved behavior.
- SRC-OPERATIONS-20260907-REPO: prior zero-day and activity conventions (94fe6e6).
- Code: migrations 20260907173000 / 20260907174000 and shared DAY_OUTCOMES.
