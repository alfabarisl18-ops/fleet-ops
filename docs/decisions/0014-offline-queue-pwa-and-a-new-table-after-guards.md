# 0014 — Offline sync: the queue design, the PWA shell, and the first table added after guards.sql

**Decided:** 2026-08-15 · **Status:** accepted

Dexie and vite-plugin-pwa were installed since Phase 1 but never wired
up. SPEC section 8 is four lines: a local write queue, `client_record_id`
for idempotent retries (already on every insertable row), a visible
pending-sync indicator, and a same-vehicle-day collision becoming "a
flagged duplicate for review, never a silent overwrite."

**Confirmed with the user:** build both the PWA shell (service worker,
manifest, installability) and the write queue in this phase, not the
queue alone. A desktop reviewer resolves same-vehicle-day conflicts, not
the collector's own device.

**Reads are never cached or served stale.** The service worker
(`vite-plugin-pwa`, `generateSW` strategy) precaches only the app shell
— confirmed in the built `dist/sw.js`: the only `registerRoute` call is
the SPA navigation fallback; there is no `runtimeCaching` entry for
`/rest/v1`, `/auth/v1`, or `/functions/v1`, so every Supabase call stays
`NetworkOnly` by omission. Serving a cached balance or target while
offline would be a real-money correctness bug, not a convenience.

**The queue is one generic mechanism (`src/lib/offlineQueue.ts`) plus a
separate registry (`src/lib/offlineQueueReplay.ts`) that maps each of
the 9 mobile-write functions to its real implementation** — kept apart
specifically to avoid a circular import (the 9 functions each import
`withOfflineQueue` from the queue file; the registry imports the 9
functions). `client_record_id` is generated once per write attempt and
reused across every retry, so a retry of a write that actually landed
(response lost, not the write) collides on that table's own
`<table>_client_record_id_key` constraint — treated as success, not an
error.

**Same-vehicle-day collisions are handled in two places, not one** —
found live, not assumed: a duplicate can happen on a live double
submission (two collectors both online at once) just as easily as on a
queued retry. The queue's own flush handler only ever sees the
queued-retry case; `recordDailyPayment`'s live path needed its own
identical check, or a same-day race between two online collectors would
have silently fallen through to a generic "Something went wrong" error
instead of SPEC's "flagged duplicate for review."

## `flagged_duplicate_payments` — the first table added after guards.sql

Phase 1 built the *entire* schema up front; every phase from 2 through 8
only ever added functions/triggers over already-existing tables — never
a genuinely new one. A project-wide test
(`src/types/db.test.ts`, "run the guards last") enforced this as an
absolute rule, because `guards.sql`'s own runtime assertions (RLS
enabled, has a policy, no anon grants, `client_record_id` unique, no
float money columns) only re-verify tables that exist *at guards.sql's
position* in migration order — a table created after it is invisible to
that check on a fresh database.

Phase 9 has a real, SPEC-named need for exactly this: `daily_payment_records`'s
own Phase-1 comment already promised "become a flagged duplicate for
review" without ever building anywhere for it to land. Rather than
weaken the safety test, `ALLOWED_TABLES_AFTER_GUARDS` (mirroring the
`ALLOWED_ANON_GRANTS` exception list already in the same file) names
this one table explicitly — and the *sibling* test in the same file
("enable row level security in the same file that creates the table")
already verifies its safety independent of position, so nothing is
actually left unguarded. Future genuinely-new tables get the same
choice: either precede `guards.sql`, or add themselves to that list and
prove they're self-guarding.

## Two more bugs found live during verification, both fixed at the root

1. `fetchPendingWrites`'s `orderBy('createdAt')` requires `createdAt` to
   be an indexed field in Dexie's schema; it wasn't. Fixed by adding it
   to the `pendingWrites` store definition — safe to change without a
   versioned migration since this local IndexedDB store has never shipped
   to a real device yet.
2. supabase-js's `PostgrestError` is a plain `{message, details, hint,
   code}` object, not an `instanceof Error` — `err instanceof Error ?
   err.message : String(err)` silently produced `"[object Object]"` for
   exactly the errors this file most needed to read, so the
   constraint-name checks (duplicate detection, the `client_record_id`
   retry-collision check) never matched anything. A live duplicate
   submission surfaced this immediately as a generic error instead of
   the flagged-review flow — caught by testing the real scenario, not by
   inspection. Fixed with a shared `errorMessage()` helper that reads
   `.message` off anything that has one before falling back to `String`.

**Revisit this when:** a future phase needs a `runtimeCaching` entry for
something genuinely safe to cache offline (e.g. static reference data
with no money in it) — the current design deliberately has none.
