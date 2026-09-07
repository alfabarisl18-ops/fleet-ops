# Deployment

Cloudflare Pages uses its GitHub integration; configuration lives in the
Cloudflare dashboard/API, not a Wrangler file or GitHub Action. The two
projects share the repository but deploy different branches and connect to
different Supabase projects. This configuration was verified on 2026-09-07.

## Branches and database targets

| Purpose | Pages project / URL | Branch | Supabase project |
|---|---|---|---|
| Live business | `fleet-ops` / `https://fleet-ops-56j.pages.dev` | `main` | `hjebavtcdduortshufku` |
| Testing | `fleet-ops-staging` / `https://fleet-ops-staging.pages.dev` | `codex/staging` | `netxgjqeaakbkjqvtdhl` |

The Pages setting named **Production branch** means the branch serving that
project's primary URL. For the staging project it must be `codex/staging`;
it does not mean the live business environment.

## Cloudflare configuration

Both projects build with `npm run build` and output `dist`.

- **Live project:** production branch `main`, automatic production
  deployments enabled, preview deployment setting **None**.
- **Staging project:** production branch `codex/staging`, automatic
  production deployments enabled, preview deployment setting **All**.
  Feature-branch previews therefore belong to the staging project.
- Staging's **Production and Preview** environment variables must both use
  `VITE_SUPABASE_URL=https://netxgjqeaakbkjqvtdhl.supabase.co` and that
  project's own `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Live Production uses `https://hjebavtcdduortshufku.supabase.co` and its
  own key. Its dormant Preview variables still target production; previews
  must stay disabled. Do not re-enable them without reviewing isolation.
- Get credentials from the matching project's dashboard, never by blindly
  copying local environment files. Never commit or print credentials.

Disabling automatic previews does not disable existing preview deployments.
**Never use old `*.fleet-ops-56j.pages.dev` preview URLs for testing.**
They can still connect to live data.

## Working and releasing

1. Create a focused feature branch from `codex/staging`. Keep unrelated
   uncommitted work intact.
2. Run `npm run typecheck`, `npm run lint`, `npm run test`, and
   `npm run build`, then review the diff.
3. With staging deployment authorization, merge the feature into
   `codex/staging` and push. This updates only the staging primary URL.
4. Verify the deployed commit, sign-in and affected flows using staging
   accounts. Inspect browser network requests to confirm they target the
   staging Supabase project. Use no real business records.
5. Show the release diff and staging results to the user. Only after explicit
   approval merge tested changes into `main`; a push to `main` automatically
   deploys the live site. Reconcile any main-branch fixes into staging before
   the next change and retest conflicts.

**Database changes are a separate operation.** Show the exact SQL and project
before any hosted SQL, including staging. Obtain approval, test migrations
on staging first, then obtain separate approval for production. Never copy
staging records to production, and never run seed/reset commands there.
Check the CLI target and local `.env.local` before local testing: changing
a Git branch does not change either target.

For a failed staging release, restore a known-good staging deployment and
keep the staging branch configuration. Do not point staging back to `main`
as a workaround. An application rollback does not roll back database changes.

## Required: Supabase Auth URL configuration

Fleet Manager invites and password resets (Settings → People) generate a
one-time link via `admin.auth.admin.generateLink()` — shown in the app for
the Owner/Admin to copy and send themselves, not emailed automatically (see
[decision 0021](decisions/0021-desktop-invite-reset-reverts-to-a-shown-link.md)
for why auto-send was tried and reverted). Both calls point `redirectTo` at
`<SITE_URL>/?set-password=1` — the flag `src/App.tsx` uses to gate entry
into the app on `SetPasswordScreen`. This is not optional polish:
Supabase's own documented behaviour
([supabase/supabase#45210](https://github.com/supabase/supabase/issues/45210))
signs the browser into a real session the instant either link is opened,
*before* a password exists — without this gate, a new Fleet Manager (or
anyone resetting their password) would be left signed in for that one
moment with no password ever set, and no way to sign in again.

For this to actually work, `<SITE_URL>` — currently
`https://fleet-ops-56j.pages.dev` (`supabase/functions/_shared/mobile-auth.ts`'s
`SITE_URL` constant) — must be registered in the Supabase dashboard:

1. Supabase dashboard → **Authentication** → **URL Configuration**.
2. **Site URL**: set to `https://fleet-ops-56j.pages.dev`.
3. **Redirect URLs**: add `https://fleet-ops-56j.pages.dev/**` (the
   wildcard covers the `?set-password=1` query string).

Without step 3, Supabase silently ignores `redirectTo` and falls back to
the Site URL instead — the link would still work, but land the person on
the plain sign-in page with no password set and no way back in.

If the production domain ever changes, update `SITE_URL` in
`supabase/functions/_shared/mobile-auth.ts`, redeploy
`admin-provision-desktop-account` and `admin-reset-desktop-password`, and
update the Redirect URLs entry above to match.

## Role-shortcut links

The app has no router — one build, one URL; which workspace shows is
decided by who signs in, not by the URL. Three query-string flags
(`src/App.tsx`, `initialUnauthedView()`) jump straight past the role
picker to a given role's sign-in screen, for anyone not already signed
in:

| Link | Lands on |
|---|---|
| `https://<your-domain>/?desktop` | Owner/Admin or Fleet Manager sign-in |
| `https://<your-domain>/?collections` | Collections & Finance PIN entry |
| `https://<your-domain>/?maintenance` | Maintenance & Repairs PIN entry |

A returning signed-in session always goes straight to that person's own
workspace regardless of what's in the URL — the flag only affects the
very first screen a signed-out visitor sees. Worth bookmarking the
matching link on each person's own device so they never see the role
picker at all.

## Staging environment

A second, fully separate deployment for real hands-on testing — same code,
different database — so testing never risks production's real vehicles,
drivers, and payments. See
[decision 0020](decisions/0020-site-url-becomes-an-edge-function-secret.md)
for why this needed a code change first.

**What it is:** a separate Supabase project with its own accounts, storage,
database and Edge Functions. Its Cloudflare Pages project now follows
`codex/staging`, independently of live `main`. Database and function changes
must be promoted explicitly; matching Git commits do not prove schema parity.
See the historical staging setup entries in `log.md` for the original seed
and parity work.

**Staging URL:** `https://fleet-ops-staging.pages.dev`

**Intentionally different from production:**

- **Accounts are entirely separate.** A staging-only Owner/Admin (never
  production's real Owner credentials) plus the three QA people — M. Sesay,
  F. Kamara, I. Turay — recreated with fresh PINs. See
  [qa-accounts.md](qa-accounts.md).
- **The `SITE_URL` Edge Function secret must be set manually** on the
  staging project (dashboard → Edge Functions → Secrets) to the staging
  URL above — the code's fallback only covers production. Skipping this
  step doesn't break anything visibly; it silently sends staging's
  invite/reset emails to the *production* domain instead, which is exactly
  the bug decision 0020 exists to describe.
- Staging's own **Authentication → URL Configuration**: Site URL and
  Redirect URLs set to the staging URL above, same requirement and same
  silent-fallback risk as production's own section above if skipped.

**Data isolation is the whole point.** Testing uses only staging accounts
and its database. The older text claimed a successful throwaway-record
isolation test, but the 2026-09-04 log explicitly left that check unverified.
Treat that historical test as unverified. The branch-separation work verifies
deployment configuration and browser connection targets; it does not claim
an authenticated cross-database record test.

## Verification on 2026-09-07

The initial branch deployment succeeded at application commit
`3778a01efdbd453ddb97f0b565e52c4ef3253f38`. Browser checks loaded all three
sign-in shortcuts and confirmed an invalid desktop login reached only the
staging Auth endpoint, returning the expected error with no uncaught page
errors. Successful account login and business-record isolation remain
unverified because no valid staging credentials were used.

## Sources

- [SRC-STAGING-20260907-USER](sources.md#src-staging-20260907-user): approved staging separation and release policy.
- [SRC-STAGING-20260907-CLOUDFLARE](sources.md#src-staging-20260907-cloudflare): live configuration and deployment inspection.
- [SRC-STAGING-20260907-DOCS](sources.md#src-staging-20260907-docs): Cloudflare branch controls.
- [SRC-STAGING-20260907-REPO](sources.md#src-staging-20260907-repo): existing client and redirect configuration.
- [SRC-STAGING-20260907-BROWSER](sources.md#src-staging-20260907-browser): observed sign-in pages and staging-only authentication request.
