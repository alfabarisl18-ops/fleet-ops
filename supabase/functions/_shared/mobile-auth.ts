// Shared between pin-sign-in and admin-provision-mobile-account. The Supabase
// Edge Function deploy tool takes one file set per function, so each
// deployment embeds its own copy of this file's contents — edit it here and
// redeploy both functions if it changes. See
// docs/decisions/0007-pin-sign-in-becomes-a-real-session.md.

/**
 * The synthetic, non-deliverable email a mobile-role account's `auth.users`
 * row is keyed on. Never shown to any user, never emailed anywhere — it
 * exists only because every variant of `admin.generateLink()` requires an
 * `email`, and mobile roles have none (`public.users.email` stays `NULL` for
 * them, by a check constraint from Phase 1 that this does not touch).
 * `.invalid` is the domain RFC 2606 reserves for addresses guaranteed never
 * to resolve or accept mail.
 *
 * Deterministic and stable: derived from `public.users.id`, which never
 * changes, so the same account always resolves to the same `auth.users` row.
 */
export function syntheticMobileEmail(publicUserId: string): string {
  return `mobile.${publicUserId}@pin.fleet-ops.invalid`
}

/**
 * A PostgREST table-level call using a service-role/secret key, sent on the
 * `apikey` header only.
 *
 * `@supabase/supabase-js`'s `createClient(url, key).from(...)` sends the same
 * key on `Authorization: Bearer` too. That is correct for a legacy JWT-shaped
 * `service_role` key, but this project's `SUPABASE_SERVICE_ROLE_KEY` holds
 * the newer `sb_secret_...` format (confirmed directly against the hosted
 * project, not assumed) — and PostgREST rejects that on `Authorization` as
 * an unparseable JWT for *table* requests specifically. `.rpc()` calls and
 * the Auth admin API (`generateLink`, `verifyOtp`, `createUser`) tolerate it
 * fine, which is why only the plain table reads/writes in these two
 * functions go through this helper instead of `.from()`.
 */
export async function adminTableRequest(
  supabaseUrl: string,
  serviceRoleKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}
