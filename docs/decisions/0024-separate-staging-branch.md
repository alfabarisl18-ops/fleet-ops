# 0024 — Staging has its own branch and database

**Decided:** 2026-09-07 · **Status:** accepted and configured.

The user wants changes tested before live data or the live site is affected.
Both Pages projects previously deployed `main`, and the live project's
feature previews also used the live database. Separate databases alone did
not provide a release gate.

Use persistent `codex/staging` for the staging primary URL, retain `main`
for production, and disable automatic previews on the live Pages project.
Feature previews stay in the staging project, with its staging-only
environment variables. This replaces decision 0020's deployment-era
assumption that staging and production mirror the same branch; its
per-project `SITE_URL` requirement remains in force.

Feature branches feed staging; tested changes reach main only after explicit
user approval. Hosted SQL still needs exact SQL and target approval for each
environment. Code promotion never copies test data. Existing live-project
preview URLs remain unsafe for testing.

No new service, database, package or runtime code is needed. Revisit if
several simultaneous releases need independent staging databases.

## Sources

- [SRC-STAGING-20260907-USER](../sources.md#src-staging-20260907-user)
- [SRC-STAGING-20260907-CLOUDFLARE](../sources.md#src-staging-20260907-cloudflare)
- [SRC-STAGING-20260907-DOCS](../sources.md#src-staging-20260907-docs)
- [SRC-STAGING-20260907-REPO](../sources.md#src-staging-20260907-repo)
