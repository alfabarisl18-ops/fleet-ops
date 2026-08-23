# 0020 — SITE_URL becomes an Edge Function secret, not a hardcoded constant

**Decided:** 2026-08-23 · **Status:** accepted

## What changed

`supabase/functions/_shared/mobile-auth.ts` hardcoded
`SITE_URL = 'https://fleet-ops-56j.pages.dev'` — the redirect target for
invite and password-recovery emails (`admin-provision-desktop-account`,
`admin-reset-desktop-password`). It's now
`Deno.env.get('SITE_URL') ?? 'https://fleet-ops-56j.pages.dev'`.

## Why

A staging environment (see `docs/deployment.md`) deploys this exact same
function code to a second Supabase project. Left hardcoded, staging's
invite/reset emails would redirect back to *production's* domain — a real
correctness bug (the same class of bug decision-worthy enough to already
have its own GitHub issue cited in this file's doc comment:
supabase/supabase#45210), not a hypothetical one.

## Why a fallback instead of requiring the secret everywhere

Production keeps working with zero action needed — the fallback is
production's own current value, so nothing breaks if the secret is never
set there. Staging's project **must** set the `SITE_URL` secret manually
(Supabase dashboard → Edge Functions → Secrets — there's no MCP tool or
CLI-free way to do this, same as SMTP configuration already is per
project). Getting this wrong on staging fails safe in one specific sense
(the link still works) but wrong in another (it lands on production
instead of staging) — documented prominently in `docs/deployment.md`'s
staging section so it isn't missed during setup.

**Revisit this when:** a third deployment (or more) makes tracking which
project has the secret set manually error-prone — at that point a
required (non-fallback) secret with a loud startup check would be safer
than a silent wrong-domain redirect.
