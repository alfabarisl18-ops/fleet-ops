# 0002 — Money is `bigint` minor units, not `integer`

**Decided:** 2026-08-08 · **Status:** accepted

Every `*_minor` column is `bigint`. CLAUDE.md says "integer minor units", which
this satisfies — the point of that rule is that money is never a float and never
a decimal type, and it holds.

`int4` would top out at 2,147,483,647 minor units, or SLE 21,474,836.47. One
imported box truck plus its landed cost can approach that, and
`savings_targets.total_budget_minor` for a multi-vehicle goal can pass it
outright. An overflow on a money column is a silent, expensive bug.

`bigint` costs four extra bytes per column. Values stay far below 2^53, so they
survive JSON as exact JavaScript numbers and no BigInt handling is needed in the
client.

**Alternatives:** `int4` as literally written, with a guard on the few large
columns — rejected, because which columns are "large" is not knowable in
advance. `numeric` — rejected outright by the hard rules, and correctly.

**Revisit if:** never, realistically. The guards migration asserts every
`*_minor` column is an integer type, so this cannot silently drift.
