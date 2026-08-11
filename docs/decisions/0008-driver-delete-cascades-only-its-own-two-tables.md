# 0008 — Driver delete cascades only the two tables Phase 3 owns

**Decided:** 2026-08-11 · **Status:** accepted

SPEC and the original `fleet.sql` comment said "a driver is never deleted —
status moves to `FORMER`." The user asked for real deletion instead, for a
driver added by mistake who never went into service: Owner/Admin only, with
a confirmation step, per `public.delete_driver()`.

11 tables reference `drivers.id`; 10 were `ON DELETE RESTRICT`. Making
delete actually work meant deciding, per table, what happens to dependent
data. `driver_assignments` and `driver_purchase_agreements` — the two
tables Phase 3 itself writes to — now `ON DELETE CASCADE`: deleting a
driver deletes their assignment history and agreement too, and the
confirmation dialog (`public.driver_delete_preview()`) says so before it
happens.

The other 9 references (`outstanding_balances`, `ledger_entries`,
`daily_payment_records`, `activity_records`, `bundled_payments`,
`driver_credits`, `trips`, `alerts`, and the polymorphic
`documents.owner_id`) were deliberately left as `RESTRICT`, unchanged. They
belong to phases that don't exist yet (5, 6, 7) and are always empty for
every driver today, so this had no practical effect at the time of this
decision. Once those phases start writing real rows, `RESTRICT` keeps
doing its job automatically: deleting a driver with real payment, trip, or
maintenance history will correctly start failing again, with no code
change needed here — `delete_driver()` surfaces that as a plain
`foreign_key_violation`.

**Revisit this when:** Phase 5 or 6 actually needs a driver with money or
trip history to be deletable too. That's a new, deliberate decision about
those specific tables' own rules (cascade and lose the record, or a
different mechanism entirely) — not an extension of this one. Until then,
a driver can only ever be deleted while their footprint is limited to
assignments and agreements.

**Alternatives considered:** gating delete on zero history everywhere
(what was originally proposed) — safer by construction, but the user
explicitly wants any driver deletable, understanding the consequence for
the two tables that exist today. Cascading all 11 references now — rejected
as guessing at rules for tables and phases that don't exist yet.
