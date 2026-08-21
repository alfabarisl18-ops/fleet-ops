# Deployment

CLAUDE.md names Cloudflare Pages as the deployment target, but as of this
writing nothing in the repo actually wires that up — no `wrangler.toml`,
no GitHub Action. This page is the one-time setup to close that gap, plus
what you get once it's done.

## One-time setup (Cloudflare dashboard, not this repo)

Cloudflare Pages' own Git integration, not the Wrangler CLI — it deploys
automatically on every push after this, with nothing to run by hand.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → select `alfabarisl18-ops/fleet-ops`.
2. Build settings:
   - Framework preset: **Vite** (or leave as None — the values below are
     what matter)
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables — set for **both** Production and Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

   Values come from `.env.local` in this repo (not committed — see
   `.env.example` for the shape) or the Supabase dashboard → Settings →
   API. Never commit real values; Cloudflare's env var store is the
   right place for them.
4. Save and deploy. From here, every push to `main` deploys to
   production automatically, and every other branch pushed to GitHub
   gets its own separate preview URL automatically, with no further
   config.

## Required: Supabase Auth URL configuration

Fleet Manager invites and password resets (Settings → People) email a
one-time link via `admin.auth.admin.inviteUserByEmail()` /
`resetPasswordForEmail()`, both pointing `redirectTo` at
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
