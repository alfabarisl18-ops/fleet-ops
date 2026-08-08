-- Fleet Operations SL — Phase 1 foundation
-- 11 · Documents.
--
-- Polymorphic: one table serves vehicle photos, driver IDs, purchase
-- agreements, bills of lading, receipts and registration papers. `owner_type`
-- plus `owner_id` name the record it belongs to, the same pattern alerts use
-- for their target.

create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  client_record_id uuid not null unique default gen_random_uuid(),
  owner_type       public.entity_type not null,
  owner_id         uuid not null,
  doc_type         public.document_type not null,
  storage_key      text not null unique,
  filename         text not null,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  uploaded_by      uuid not null references public.users (id),
  uploaded_at      timestamptz not null default now()
);

-- No audio anywhere. No microphone access, no recording, no playback, no
-- transcription — so an audio file cannot be attached to anything, ever.
alter table public.documents add constraint documents_no_audio check (
  lower(mime_type) not like 'audio/%'
);

-- Field photographs come off mid-range Android phones over metered data. 10 MB
-- is already generous for a licence photo; anything larger is a mistake, and
-- the client should be compressing before upload.
alter table public.documents add constraint documents_size_limit check (
  size_bytes <= 10 * 1024 * 1024
);

create index documents_owner_idx on public.documents (owner_type, owner_id);
create index documents_type_idx  on public.documents (doc_type);

create trigger documents_stamp_uploaded_at
  before insert on public.documents
  for each row execute function app.stamp_event_time('uploaded_at');

alter table public.acquisition_payments
  add constraint acquisition_payments_receipt_document_fk
  foreign key (receipt_document_id) references public.documents (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.documents enable row level security;

-- SPEC section 3: "Driver ID and licence images are visible to Owner/Admin and
-- Fleet Manager only. Collections and Maintenance never see them." Here the
-- restriction is per row rather than per column, so a policy is the right tool.
create policy documents_select_desktop on public.documents
  for select to authenticated using (app.is_desktop());

create policy documents_select_mobile_non_identity on public.documents
  for select to authenticated
  using (
    (app.is_collections() or app.is_maintenance())
    and doc_type not in ('DRIVER_ID', 'DRIVER_LICENCE')
  );

create policy documents_insert_desktop on public.documents
  for insert to authenticated
  with check (app.is_desktop() and uploaded_by = app.current_user_id());

-- Maintenance & Repairs photographs a problem; Collections & Finance
-- photographs a receipt. Neither can upload an identity document.
create policy documents_insert_mobile on public.documents
  for insert to authenticated
  with check (
    (app.is_collections() or app.is_maintenance())
    and uploaded_by = app.current_user_id()
    and doc_type not in ('DRIVER_ID', 'DRIVER_LICENCE')
  );

grant select, insert on public.documents to authenticated;
