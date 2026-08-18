-- Fleet Operations SL
-- Mobile document Storage access — closes the gap decision 0015 disclosed
-- ("Maintenance & Repairs photographs a problem; Collections & Finance
-- photographs a receipt" — already true of the `documents` TABLE's own
-- RLS, but the Storage bucket itself only had desktop policies).
--
-- Scoped narrowly, not a blanket mobile grant: each mobile role may only
-- read/write objects whose storage key's first path segment (the
-- document's owner_type — see src/lib/documents.ts's storage key format,
-- `${ownerType}/${ownerId}/${id}-${filename}`) matches what that role is
-- actually allowed to photograph. Collections & Finance gets
-- LEDGER_ENTRY (a receipt on an Other Payment); Maintenance & Repairs
-- gets MAINTENANCE_ORDER (a problem/parts photo). Neither can read or
-- write a VEHICLE, DRIVER, or DRIVER_PURCHASE_AGREEMENT object even
-- though those live in the same bucket — this is enforced here in
-- Postgres, not by which document types the app's own UI happens to
-- offer (CLAUDE.md: "a hidden button is not a permission").
--
-- storage.foldername(name) is Supabase Storage's standard helper,
-- splitting an object key into its path segments as text[] — the same
-- pattern used throughout Supabase's own "restrict to a folder" RLS
-- examples.

create policy documents_bucket_select_collections on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and app.is_collections()
    and (storage.foldername(name))[1] = 'LEDGER_ENTRY'
  );

create policy documents_bucket_insert_collections on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and app.is_collections()
    and (storage.foldername(name))[1] = 'LEDGER_ENTRY'
  );

create policy documents_bucket_select_maintenance on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and app.is_maintenance()
    and (storage.foldername(name))[1] = 'MAINTENANCE_ORDER'
  );

create policy documents_bucket_insert_maintenance on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and app.is_maintenance()
    and (storage.foldername(name))[1] = 'MAINTENANCE_ORDER'
  );
