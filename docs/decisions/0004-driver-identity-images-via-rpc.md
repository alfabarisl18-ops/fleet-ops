# 0004 — Driver identity images are read through a function, not a column grant

**Decided:** 2026-08-08 · **Status:** accepted

SPEC section 3: "Driver ID and licence images are visible to Owner/Admin and
Fleet Manager only. Collections and Maintenance never see them."

The first attempt withheld `drivers.id_image_key` and `drivers.licence_image_key`
from the `authenticated` role by column grant, which is the usual Postgres tool
for column-level security. Testing showed it denied all four roles, including
the two that must have access. The reason is structural: all four application
roles authenticate as the single Postgres role `authenticated`, and the
application role lives in `public.users`. A column grant cannot see that
distinction. Row level security cannot help either — a policy filters rows.

So the columns stay ungranted, and `public.driver_identity_images(uuid)` is the
only route to them: `SECURITY DEFINER`, so it can read what the caller cannot;
in `public`, because that is the only schema PostgREST exposes; and it raises
`insufficient_privilege` unless `app.is_desktop()`.

Consequence for the data layer: queries against `drivers` must list columns
explicitly. `select('*')` fails. That is deliberate and worth the friction.

The same rule applied to the files themselves is a plain row policy on
`public.documents`, where `DRIVER_ID` and `DRIVER_LICENCE` rows are invisible to
both mobile roles. Those two are the only ways to reach an identity image.

**Alternatives:** give each application role its own Postgres role, so column
grants work — a much larger change to how PIN sessions mint JWTs, and worth
reconsidering in Phase 2 if column-level rules multiply. Drop the two columns and
keep identity images only in `documents` — cleaner, arguably better normalised,
but removes columns SPEC names.

**Revisit if:** Phase 2 gives each role a distinct Postgres role, or if more than
two or three columns need this treatment.
