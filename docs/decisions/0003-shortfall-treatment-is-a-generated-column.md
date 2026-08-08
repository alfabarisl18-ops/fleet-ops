# 0003 — `shortfall_treatment` is a generated column

**Decided:** 2026-08-08 · **Status:** accepted

CLAUDE.md says `shortfall_treatment` is derived from `day_outcome` "in the data
layer and must never be selectable by the person entering the record". It is
derived in the database instead, as `GENERATED ALWAYS ... STORED`.

A data-layer rule is a promise the data layer keeps. A generated column is a
promise Postgres keeps: supplying a value raises `cannot insert a non-DEFAULT
value into column "shortfall_treatment"` regardless of which client sent it,
which credential it held, or whether it went through `src/data/` at all. For the
single rule the whole product turns on, that difference is worth having.

Management review is a separate nullable `shortfall_treatment_override` column,
writable only by the two desktop roles and only through a narrow `UPDATE` grant.
SPEC section 5 allows Owner/Admin or Fleet Manager to convert an accepted
shortfall to driver debt on review; keeping the override distinct means the
original derivation and the decision to depart from it both survive in the row.

**Alternatives:** a `BEFORE INSERT` trigger that overwrites whatever was sent —
works, but silently accepts a wrong value rather than rejecting it, and a
silently-corrected write is how a client bug survives for months. A `CHECK`
constraint — rejects bad values but still requires the client to compute the
right one.

**Revisit if:** open question 6 is answered such that Breakdown stops being a
separate outcome, or if a fifth treatment appears. Changing the expression is a
migration and a table rewrite, so it is not free.
