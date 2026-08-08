# 0005 — Append-only means "financial facts are frozen", not "no column ever moves"

**Decided:** 2026-08-08 · **Status:** accepted

Structural rule 3 says money rows are append-only and nothing is updated in
place. Read absolutely literally, that freezes `reconciled_at`,
`approval_status`, `superseded_by_id` and the remaining amount on a balance —
and then reconciliation, the approvals workspace and balance settlement all
become impossible without a parallel table each.

`app.enforce_append_only()` takes the allow-list as trigger arguments. It blocks
every `DELETE` unconditionally, and blocks every `UPDATE` to any column not
named. The lists are short and hold only review metadata about a row that is not
itself changing:

| Table | May move |
|---|---|
| `ledger_entries` | `reconciled_at`, `reconciled_by`, `approval_status`, `superseded_by_id` |
| `daily_payment_records` | the four `shortfall_treatment_override_*` columns, `ledger_entry_id`, `bundled_payment_id` |
| `outstanding_balances` | `remaining_amount_minor`, `promised_date`, `reminder_date`, `status`, `closed_at` |
| `driver_credits` | `remaining_minor`, `consumed_on` |
| `acquisition_payments` | `ledger_entry_id`, `receipt_document_id`, `next_due_on` |
| `maintenance_parts` | `ledger_entry_id` |
| everything else | nothing |

Amounts, dates, direction, category, vehicle and driver are frozen from the
moment the row is written, on every table. A mistake in any of those is a
correction row plus a superseding entry, exactly as the rule intends.
`outstanding_balances` additionally cannot increase — owing more is a new row.

**Alternatives:** a strict reading with a separate `ledger_entry_review` table
holding the mutable state — more faithful to the words, one more join on every
Accounting query, and reconciliation state that can drift out of step with the
entry it describes.

**Revisit if:** an allow-list ever needs a column that carries an amount or a
date. That would be the signal this compromise has been stretched too far.
