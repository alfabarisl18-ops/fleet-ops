# 0007 — How a PIN check becomes a real Supabase session

**Decided:** 2026-08-09 · **Status:** accepted

SPEC section 1: Collections & Finance and Maintenance & Repairs sign in with a
4-digit PIN, checked against `app_private.user_pin_credentials`, and the PIN
works on any device with no device binding. Supabase Auth has no native concept
of a PIN. This record is the researched answer to "how does a successful PIN
check become a Postgres session that `auth.uid()` resolves and every existing
RLS policy already understands" — asked for explicitly before implementation,
the way [0004](0004-driver-identity-images-via-rpc.md) was.

Every claim below about Supabase's actual behaviour was checked against
official documentation or tested directly against the hosted project before
being relied on — not assumed from memory. Two of those checks changed the
design from what a first pass would have produced.

## The mechanism: `admin.generateLink` + `verifyOtp`, both server-side

Supabase Auth's Admin API has a documented, supported way to mint a real
session for a user without a password and without sending anything
anywhere:

1. `supabase.auth.admin.generateLink({ type: 'magiclink', email })` — creates
   a one-time token for an existing (or new) user and returns it in
   `data.properties.hashed_token`. **It does not send an email.** It only
   returns the token; the caller decides what to do with it. (Confirmed
   against the shipped `@supabase/auth-js` type definitions and corroborated
   by community reports of exactly this two-call pattern.)
2. `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` — consumes
   that token and returns a normal `Session` (`access_token`, `refresh_token`),
   indistinguishable from any other sign-in.

Both calls happen inside the `pin-sign-in` Edge Function, back to back, using
the service-role key. The token is never displayed, never emailed, never
leaves the function. This is the same pattern Supabase's own docs describe for
WebAuthn and other credential types Auth doesn't natively support — a PIN is
one more.

## The correction empirical testing forced: these functions cannot live in `app_private`

The first draft of this design put the PIN-verification logic in
`app_private`, next to the table it reads — consistent with how every other
private function in this codebase is placed. That would have been wrong, and
testing caught it before any code shipped.

`generateLink`/`verifyOtp` go through Supabase Auth (`/auth/v1/...`), a
separate service from PostgREST, so they're unaffected. But the *Edge
Function's own call* to a Postgres function — `supabase.rpc('verify_pin', …)`
— goes through PostgREST like any other RPC, **using the same
`/rest/v1/rpc/...` HTTP path regardless of which Postgres role the caller's
key maps to.** Tested directly against the hosted project:

```
POST /rest/v1/rpc/freetown_today   (no profile header, i.e. schema "public")
→ 404 PGRST202 — Could not find the function public.freetown_today

POST /rest/v1/rpc/freetown_today   (Accept-Profile: app)
→ 406 PGRST106 — Invalid schema: app.
   Only the following schemas are exposed: public, graphql_public.
```

`PGRST106` is PostgREST's schema-cache lookup rejecting the request before any
Postgres-level grant is ever consulted — it fires identically for `anon`,
`authenticated`, and `service_role`, because it isn't a permission check, it's
a routing decision. **`app` and `app_private` cannot be reached by anyone over
the API, service role included.** This is exactly what Phase 1 intended
("nothing in them can be called or read over the API") and is good — but it
means the door Phase 1 closed can't be the one this feature walks through
either.

The fix follows the precedent [0004](0004-driver-identity-images-via-rpc.md)
already set: put the callable function in `public` — where PostgREST can find
it — and let the Postgres `GRANT`/internal role-check do the access control
that schema-hiding can no longer provide. `public.verify_pin`,
`public.touch_session`, `public.admin_reset_pin`, and
`public.mobile_role_roster` all live in `public` for exactly this reason.
`app_private.user_pin_credentials` itself is untouched: still ungranted to
every client role, still `ENABLE ROW LEVEL SECURITY` with no policies. The
only new door is one narrow, audited function per operation, same as before.

## Mobile accounts need a real (but synthetic) email

`generateLink`'s parameter types (`GenerateInviteOrMagiclinkParams`) require
`email` in every variant — there is no `user_id`-only path. But
`public.users.email` is `NULL` for mobile roles by a `CHECK` constraint written
in Phase 1, and that constraint is correct: SPEC describes mobile roles as
having no email, and nothing about this feature changes what a mobile-role
person is asked for or shown.

The two facts are reconciled by keeping them at different layers.
`auth.users.email` — Supabase Auth's own internal bookkeeping column, which no
screen ever displays and no `public.users` column mirrors — gets a synthetic
address of the form `mobile.<user_id>@pin.fleet-ops.invalid`. `.invalid` is the
domain RFC 2606 reserves specifically for addresses guaranteed never to
resolve or accept mail. It exists only so `generateLink` has an `email` to key
on; nothing ever sends to it, because nothing ever emails the link — it's
generated and consumed in the same function call.

## Throttling: 5 failed attempts, 15-minute lock, no reset from the client

A 4-digit PIN is 10,000 combinations, and the whole point of "works on any
device" is that a stolen phone is not a barrier. `app_private.user_pin_credentials`
already carried `failed_count` and `locked_until` columns from Phase 1,
anticipating this.

The numbers and reasoning below were designed for `public.verify_pin`, the
per-account version — still correct, still in the database, no longer what
the sign-in screen calls. `public.verify_role_pin` (see "Role, then PIN"
below) applies the identical 5-attempt/15-minute shape one level coarser, per
role instead of per account, since it doesn't know which account it's
checking until one matches.

- 5 consecutive wrong guesses locks the account for 15 minutes.
- An attempt made while already locked is rejected immediately — the PIN is
  never even compared — and **does not extend the lock or touch
  `failed_count`.** If it did, an attacker could keep a legitimate user locked
  out indefinitely just by continuing to guess; a lock that only the passage
  of time or an Owner's reset can lift is what makes the lockout a barrier to
  the attacker rather than a tool for one.
- A correct PIN resets `failed_count` to 0 and clears `locked_until`.
- The response is the same generic "Incorrect PIN" whether the account
  doesn't exist, isn't a mobile role, is suspended, is locked, or the PIN is
  simply wrong. Distinguishing any of those to the caller would let an
  attacker enumerate valid staff identifiers for free.

At 5 guesses per 15 minutes an attacker gets at most 480 guesses/day against a
10,000-value space — roughly a week of continuous, unattended guessing for an
even-odds hit, not a number that survives a human noticing a phone is
misbehaving for that long. This is a starting point, not a ceiling: the
threshold and lock duration are two constants in one function
(`public.verify_pin`), not logic spread across the codebase, so tightening
them later is a one-line change. What this does **not** cover: per-IP or
cross-account throttling, which needs infrastructure outside Postgres (e.g. a
Cloudflare rule once this is actually deployed to Cloudflare Pages). Flagged
as a follow-up, not built now — the ask was per-account throttling for a PIN
that has no other barrier, and that's what this delivers.

Hashing uses `pgcrypto`'s `crypt()`/`gen_salt('bf', 10)` — genuine bcrypt,
already enabled on this project (`pgcrypto 1.3`, confirmed via
`list_extensions` before writing a line of code), so this adds no dependency
and keeps the comparison inside the one `SECURITY DEFINER` function that also
enforces the lockout — the hash is read once, compared once, and never leaves
that function's execution, not even into the Edge Function's memory.

## Idle expiry is enforced by Postgres, not by Supabase's session lifetime

SPEC: "Mobile sessions expire on inactivity. Desktop sessions can follow
normal Supabase defaults." Supabase's own session/refresh-token lifecycle has
no idle concept — a refresh token stays valid indefinitely as long as
something refreshes it before expiry, active or not. Bolting inactivity
tracking onto that mechanism directly isn't available, so it's enforced one
layer up, in the same place every other authorization decision in this
database already happens: `app.current_user_id()` and `app.current_app_role()`.

Every RLS policy in the database calls one of these two functions, directly or
through `app.is_desktop()` / `is_collections()` / `is_maintenance()` /
`is_owner()` / `is_signed_in()`, all of which are thin wrappers over
`current_app_role()`. That makes them the one choke point where "is this
mobile session still allowed to act" can be enforced without touching any of
the ~90 existing policies. For a desktop role, both functions resolve exactly
as they did in Phase 1 — `auth_user_id` matches, status is `ACTIVE`, nothing
else asked, matching "normal Supabase defaults" literally. For a mobile role,
they additionally require a live `public.sessions` row: not revoked, its hard
cap (`expires_at`, 12 hours from mint) not passed, and `last_seen_at` within
the last 30 minutes.

30 minutes idle and a 12-hour hard cap are both judgement calls SPEC doesn't
number. 30 minutes is long enough to survive a pause between deliveries or a
dead zone without forcing a re-entry mid-task, short enough that a phone set
down mid-shift doesn't stay live into the evening. The 12-hour cap means even
continuous activity forces a fresh PIN the next day. Both are two lines in one
function (`current_app_role`), not a setting exposed anywhere yet — tune them
there if the numbers are wrong in practice.

`public.touch_session(session_id)` is the heartbeat: the mobile client calls it
after each successful action (never on a plain read, so browsing doesn't
silently keep a session alive) and it advances `last_seen_at`. It checks
ownership and the hard cap directly against `auth.uid()`, not through the
idle-gated helpers — otherwise a session one second past the idle window could
never be told about a keystroke that arrived a moment too late to save it. A
session already past its 30 minutes needs a fresh PIN, deliberately; a session
one heartbeat away from it does not.

## Identifying who's signing in: three designs, in the order they were tried

A PIN alone can't identify who's signing in unless PINs are actually unique.
Three designs were tried, in this order, and the first two were built and
working before being replaced — recorded here rather than erased, because the
reasoning that ruled them out is exactly the reasoning that shapes the third.

**1. Type a memorised staff number alongside the PIN.** Rejected before being
built. Keeps `anon` at literally zero privilege, matching Phase 1's guarantee
to the letter. Loses on the deciding test: SPEC calls for "large touch
controls... simple," and asking field staff to remember and correctly type a
second, meaningless number is worse than recognising their own name in a list
of two or three people, for no real gain — the offline argument doesn't hold
up either; authenticating at all requires one moment of connectivity
regardless of which identifier scheme is used.

**2. A name picker backed by a narrow anonymous read.** Built, deployed, and
tested end to end before being replaced. `public.mobile_role_roster(role)`
returned exactly `id` and `display_name` for `ACTIVE` users of a mobile role —
no phone, no email, no photo — and was the first and, at the time, only
`EXECUTE` grant to `anon` in this database. Structurally safe (it could never
return a desktop role, and it was never a table grant, so it never touched the
guard migration's actual guarantee of zero anonymous table reads) but replaced
anyway: told directly, mid-build, that these two roles are low-stakes by
design — "they just collect data, they don't need to be that secure, the PIN
is just so people can't walk up and use it" — a name-then-PIN flow was more
ceremony than that risk level called for.

**3. Role, then PIN. Nothing else. Chosen.** The client sends
`{ role, pin }`; `public.verify_role_pin` tries the PIN against every
`ACTIVE` account of that role and signs in whichever one matches. This only
works if PINs cannot collide, so `public.admin_reset_pin` now rejects setting
a PIN that any other active mobile-role account already holds — checked by
re-deriving the hash (`crypt(new_pin, existing_hash) = existing_hash`) against
every candidate, since salted hashes can't be compared with a unique index.

The one real cost: **the per-account throttle in `public.verify_pin` no
longer applies**, because there is no account to attribute a wrong guess to
until one matches. `public.verify_role_pin` throttles per *role* instead —
one shared 5-attempt/15-minute counter
(`app_private.role_pin_throttle`) for all of Collections & Finance, another
for all of Maintenance & Repairs. A teammate's mistyped PIN can now lock out
someone else on the same role for the same 15 minutes, which the per-account
design specifically avoided. Accepted deliberately, matching the stated risk
tolerance: the throttle still exists and still bounds brute force
(≤480 guesses/day against the same reasoning as before) — it is coarser, not
absent.

`public.mobile_role_roster` and `public.verify_pin` (the per-account version)
are not dropped — both are correct, tested, and harmless left in place. No
current screen calls either; a future Settings/PIN-management screen that
already knows which account it's looking at is exactly where they'd be used
again.

## Where a service role key still does the provisioning, for now

Creating the `auth.users` row a mobile account needs — with its synthetic
email — has to go through `admin.createUser()`, because directly `INSERT`ing
into `auth.users` bypasses GoTrue's own bookkeeping (`auth.identities`,
confirmation state, and more) and is not how Supabase intends that table to be
written. That's the `admin-provision-mobile-account` Edge Function: callable
only by an already-signed-in Owner/Admin, whose identity it checks itself
before doing anything.

Desktop account bootstrapping has no equivalent function yet, on purpose.
SPEC's own account model — "Accounts are created by the Owner/Admin," already
written into `supabase/config.toml`'s `enable_signup = false` in Phase 1 — and
the fact that Phase 2 explicitly excludes any screen beyond sign-in itself,
mean the first Owner/Admin account for a real deployment is created once,
manually, via the Supabase Dashboard (Authentication → Add User), then linked
by setting `public.users.auth_user_id` — a step documented in
[README.md](../../README.md) rather than built as a throwaway signup form this
phase doesn't need. The two desktop accounts used to test this phase were
bootstrapped the same way, directly against the hosted project, for testing —
not a shortcut the running application takes.

## What would make us revisit this

The plan going in was to use legacy JWT-based keys throughout, since Supabase's
docs say they keep working through the end of 2026 and every example above —
`admin.generateLink`, `verifyOtp`, `supabase.functions.invoke` — is documented
against them. Testing found that plan was already half wrong: this project's
`SUPABASE_SERVICE_ROLE_KEY` — the env var every Edge Function gets by
default — turned out to hold the *newer* `sb_secret_...` format, not a legacy
JWT, discovered only by having the function decode and report its own key
when a real `sessions` insert failed with a permission error that made no
sense otherwise (`grant to authenticated` — for a call made with the service
role key). `@supabase/supabase-js`'s `.from()` sends that key on both `apikey`
and `Authorization: Bearer`; PostgREST accepts the new-format key on `apikey`
but tries to parse whatever arrives on `Authorization` as a JWT, and rejects
it for *table* requests specifically — `.rpc()` calls and the Auth admin API
tolerate it fine, which is why `admin.generateLink`/`verifyOtp`/`createUser`
needed no change and only the plain table reads/writes did.

The fix is `adminTableRequest` in `supabase/functions/_shared/mobile-auth.ts`:
a raw `fetch` that sends the service-role key on `apikey` only, used in place
of `.from()` in both Edge Functions. The legacy `anon` key used by the browser
client and by `pin-sign-in`'s own caller-facing side is unaffected — it's a
real JWT, `Authorization: Bearer` is exactly where it belongs, and every curl
test in this document that used it worked on the first correctly-built
attempt. Revisit `adminTableRequest` if Supabase ever ships a supabase-js
release that places new-format keys correctly on its own, or before legacy
keys are actually turned off, whichever comes first — check by removing the
helper and re-running the table-write tests, not by assuming.

Also revisit if: the 5-attempt/15-minute throttle proves too loose or too
tight in practice; per-IP throttling becomes worth building once this is
behind Cloudflare; or a role beyond the current four needs a session-liveness
rule different from "desktop: none, mobile: 30 minutes idle" — at which point
the single `case` inside `current_app_role()` stops being able to express it
in one branch and needs its own table instead of two constants.
