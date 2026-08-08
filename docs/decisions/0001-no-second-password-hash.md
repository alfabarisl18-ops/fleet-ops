# 0001 — No `password_hash` column on `users`

**Decided:** 2026-08-08 · **Status:** accepted

SPEC section 3 lists `password_hash` on the `users` table. It is not there.
Supabase Auth already stores the password hash in `auth.users`, and a second
copy would be a second place to leak it and a second place to rotate it — with
no mechanism keeping the two in step. `public.users.auth_user_id` links to the
Auth record instead.

The PIN hash is a different matter, because Supabase Auth has no concept of a
4-digit PIN. It lives in `app_private.user_pin_credentials`: a schema that is
not on the PostgREST exposed list, holds no grant for any client role, and has
RLS enabled with no policies so a future mistake fails closed.

**Alternatives:** store both hashes in `public.users` as SPEC literally says;
put the PIN hash in `public.users` and rely on column grants. The first
duplicates a secret. The second still puts a credential in the schema PostgREST
serves, one `select *` away from a mistake.

**Revisit if:** the project moves off Supabase Auth, at which point
`public.users` would need to own credentials again.
