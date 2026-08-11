# QA / verification accounts

Three accounts exist in the hosted project reserved for agent-driven and
manual verification, so verifying a change never requires the Owner's real
personal credentials:

| Account | Role | Purpose |
|---|---|---|
| M. Sesay (`manager@example.com`) | Fleet Manager | Desktop workspace verification — shares Phase 3's screens with Owner/Admin (SPEC section 4), so it covers everything Owner/Admin would without using the real account. |
| F. Kamara | Collections & Finance | Mobile PIN sign-in verification. |
| I. Turay | Maintenance & Repairs | Mobile PIN sign-in verification. |

All three were seeded as business rows in `supabase/seed.sql` (no
credentials — see that file's own header) and later linked to real
`auth.users` rows for testing, per
[decision 0007](decisions/0007-pin-sign-in-becomes-a-real-session.md).

**Rules for these accounts:**

- Never used for real data. Anything created while signed in as one of
  these (a test vehicle, a test driver, a test payment) is QA output, not a
  business record, and should be identifiable as such or cleaned up
  afterward.
- Credentials (the Fleet Manager password, the two PINs) are **not**
  written into this file or any other git-tracked file — a private repo is
  not a reason to commit plaintext credentials, per CLAUDE.md. When a
  session needs to sign in as one of them, ask the user, or set a fresh
  known value via SQL (`admin_reset_pin` for the mobile roles; a direct
  `auth.users.encrypted_password` update, shown before running, for the
  Fleet Manager account) and treat it as ephemeral for that session.
- Never the Owner's real account. If a task seems to need the real
  Owner/Admin session specifically (not just "a desktop role" or "a mobile
  role"), that's a sign the task needs the user themselves at the keyboard,
  not a credential handed to the agent.

See `docs/log.md`'s 2026-08-11 entries for why this exists: Phase 3's
verification pass ran out of a live session partway through, and the user
offered their real password in chat to unblock it — which was correctly
declined, but left the actual verification gap open. These three accounts
close that gap permanently, not just for that one phase.
