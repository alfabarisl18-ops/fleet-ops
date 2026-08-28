# 0021 — Desktop invite/reset reverts to a shown link, not an auto-sent email

**Decided:** 2026-08-28 · **Status:** accepted

## What happened

Earlier this session, `admin-provision-desktop-account` and
`admin-reset-desktop-password` were switched from `generateLink()` (returns
a link, sends nothing) to `inviteUserByEmail()` / `resetPasswordForEmail()`
(Supabase's own methods that send the email themselves, via whatever SMTP is
configured), once this project's Resend SMTP was confirmed working with a
successful test email.

Onboarding a real Fleet Manager (Zainab Barrie) then failed live:
`AuthRetryableFetchError: Error sending invite email`, confirmed straight
from the Edge Function's own server logs. Root cause, confirmed against
Resend's own documentation: Resend's shared `onboarding@resend.dev` sending
address can only ever reach the account owner's own inbox. Sending to any
other recipient requires verifying a domain you own — adding DNS records at
your registrar — which this project doesn't have set up, and the user does
not want to buy/configure a domain right now.

## What changed

Both functions revert to `generateLink()`. The app shows the returned
one-time link (`AddPersonForm.tsx`'s success screen, and the equivalent panel
in `PeopleList.tsx` for "Finish setup" / "Reset password" on an existing
Fleet Manager row) with a copy button, and the Owner/Admin delivers it
themselves — WhatsApp, SMS, in person. `provisionDesktopPerson()` /
`resetDesktopPassword()` go back to `Promise<string>` (the link) instead of
`Promise<void>`.

## Why revert instead of fixing the domain now

- **Cost and scope**: a verified sending domain means either using a domain
  the business already owns (fine, no cost) or buying one (~$10–15/year,
  ongoing) — a real decision the user should make deliberately, not as a
  blocking side effect of onboarding one person.
- **Zero cost, zero new infrastructure**: the shown-link flow is exactly
  what this feature did before this session's SMTP experiment, and it needs
  nothing beyond what already exists.
- **Nothing is lost**: SMTP itself stays configured in the Supabase
  dashboard for other uses (e.g. Supabase's own auth emails) — only these
  two Edge Functions stop depending on it reaching arbitrary recipients.

## Consequence for staging

`docs/deployment.md`'s "Staging environment" section previously called out
"no SMTP configured" as something staging was *missing* relative to
production. After this revert, production doesn't depend on SMTP for these
two functions either — staging and production are consistent again, with
neither needing it.

**Revisit this when:** the user verifies a real sending domain in Resend (or
switches SMTP providers to one that doesn't have this restriction) — at that
point, re-apply the `inviteUserByEmail()` / `resetPasswordForEmail()` change
this decision reverts, exactly as it was before this document.
