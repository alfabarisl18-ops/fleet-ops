-- Fleet Operations SL — Phase 3 (Vehicles and Drivers)
-- app.freetown_today() (20260808232117_schemas_and_helpers.sql) is the only
-- correct source of a business date, but the app schema is unreachable over
-- PostgREST — only public and graphql_public are exposed, regardless of
-- caller role. The driver-list "overdue" count needs to compare
-- outstanding_balances.promised_date against today, and CLAUDE.md is
-- explicit: never derive a business date from new Date() on the client. A
-- thin, read-only, SECURITY INVOKER public wrapper is the correct fix, not a
-- workaround.

create or replace function public.freetown_today()
  returns date
  language sql
  stable
  set search_path = ''
as $$
  select app.freetown_today();
$$;

comment on function public.freetown_today() is
  'Today''s date in Africa/Freetown, as seen by every business-date column. '
  'The only correct source for a client that needs "today" for a comparison '
  '(e.g. an overdue check) rather than a value to store — storage should '
  'still rely on each column''s own default, not this.';

-- New function in public defaults to EXECUTE granted to PUBLIC.
revoke all on function public.freetown_today() from public, anon;
grant execute on function public.freetown_today() to authenticated;
