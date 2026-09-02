-- Fleet Operations SL
-- Performance cleanup, not a security change: Supabase's advisor flags 6
-- "multiple permissive policies" warnings (activity_records/corrections
-- SELECT, documents INSERT+SELECT, ledger_entries INSERT+SELECT). Each was
-- a deliberate pair/triplet of policies for the same role+action — one for
-- "desktop sees/does everything", one or two more for "a mobile role only
-- sees/does its own" — which Postgres evaluates as OR'd conditions per row.
-- Correct access model, just N policy evaluations instead of one. This
-- migration merges each group into a single policy with the same OR'd
-- condition — identical semantics, one evaluation instead of two or three.
--
-- Every USING/WITH CHECK clause below is copied verbatim from the policies
-- it replaces (20260808232354_money.sql, 20260808232650_documents.sql) and
-- combined with OR, not rewritten from scratch — the goal is zero change
-- in who can see or write what.

-- ---------------------------------------------------------------------------
-- activity_records SELECT: activity_select_desktop OR activity_select_own
-- ---------------------------------------------------------------------------

drop policy activity_select_desktop on public.activity_records;
drop policy activity_select_own on public.activity_records;

create policy activity_select on public.activity_records
  for select to authenticated
  using (app.is_desktop() or entered_by = app.current_user_id());

-- ---------------------------------------------------------------------------
-- corrections SELECT: corrections_select_desktop OR corrections_select_own
-- ---------------------------------------------------------------------------

drop policy corrections_select_desktop on public.corrections;
drop policy corrections_select_own on public.corrections;

create policy corrections_select on public.corrections
  for select to authenticated
  using (app.is_desktop() or requested_by = app.current_user_id());

-- ---------------------------------------------------------------------------
-- documents SELECT: documents_select_desktop OR documents_select_mobile_non_identity
-- ---------------------------------------------------------------------------

drop policy documents_select_desktop on public.documents;
drop policy documents_select_mobile_non_identity on public.documents;

create policy documents_select on public.documents
  for select to authenticated
  using (
    app.is_desktop()
    or (
      (app.is_collections() or app.is_maintenance())
      and doc_type not in ('DRIVER_ID', 'DRIVER_LICENCE')
    )
  );

-- ---------------------------------------------------------------------------
-- documents INSERT: documents_insert_desktop OR documents_insert_mobile
-- ---------------------------------------------------------------------------

drop policy documents_insert_desktop on public.documents;
drop policy documents_insert_mobile on public.documents;

create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    uploaded_by = app.current_user_id()
    and (
      app.is_desktop()
      or (
        (app.is_collections() or app.is_maintenance())
        and doc_type not in ('DRIVER_ID', 'DRIVER_LICENCE')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- ledger_entries SELECT: ledger_select_desktop OR ledger_select_own_collections
-- OR ledger_select_own_maintenance
-- ---------------------------------------------------------------------------

drop policy ledger_select_desktop on public.ledger_entries;
drop policy ledger_select_own_collections on public.ledger_entries;
drop policy ledger_select_own_maintenance on public.ledger_entries;

create policy ledger_select on public.ledger_entries
  for select to authenticated
  using (
    app.is_desktop()
    or ((app.is_collections() or app.is_maintenance()) and entered_by_user_id = app.current_user_id())
  );

-- ---------------------------------------------------------------------------
-- ledger_entries INSERT: ledger_insert_collections OR ledger_insert_maintenance
-- OR ledger_insert_desktop
-- ---------------------------------------------------------------------------

drop policy ledger_insert_collections on public.ledger_entries;
drop policy ledger_insert_maintenance on public.ledger_entries;
drop policy ledger_insert_desktop on public.ledger_entries;

create policy ledger_insert on public.ledger_entries
  for insert to authenticated
  with check (
    entered_by_user_id = app.current_user_id()
    and (
      app.is_desktop()
      or app.is_collections()
      or (app.is_maintenance() and direction = 'EXPENSE' and category in ('PARTS', 'LABOUR', 'MAINTENANCE'))
    )
  );
