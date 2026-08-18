import { supabase } from '@/lib/supabase'
import { compressImageFile } from '@/lib/compressImage'
import type { Enums } from '@/types/db'

// The first real Supabase Storage feature in the app (Phase 10). Scoped to
// desktop only, matching Future Purchases' own need — see the "documents"
// bucket's RLS policies in supabase/migrations/20260816010000_future_purchases.sql
// and decision 0015. NOT a fix for the pre-existing gap where Maintenance &
// Repairs / Collections & Finance have a documents-TABLE grant but no
// working upload path — that stays a disclosed limitation.

export type DocumentOwnerType = Enums<'entity_type'>
export type DocumentType = Enums<'document_type'>

const BUCKET = 'documents'

/** Mirrors the database's own constraints (documents_no_audio,
 *  documents_size_limit) so a rejected file fails fast, client-side,
 *  before a network round trip rather than after one. */
const MAX_SIZE_BYTES = 10 * 1024 * 1024

export interface DocumentItem {
  id: string
  ownerType: DocumentOwnerType
  ownerId: string
  docType: DocumentType
  storageKey: string
  filename: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

export async function fetchDocuments(ownerType: DocumentOwnerType, ownerId: string): Promise<DocumentItem[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, owner_type, owner_id, doc_type, storage_key, filename, mime_type, size_bytes, uploaded_at')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((d) => ({
    id: d.id,
    ownerType: d.owner_type,
    ownerId: d.owner_id,
    docType: d.doc_type,
    storageKey: d.storage_key,
    filename: d.filename,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    uploadedAt: d.uploaded_at,
  }))
}

export interface UploadDocumentInput {
  ownerType: DocumentOwnerType
  ownerId: string
  docType: DocumentType
  file: File
  uploadedBy: string
}

/** No audio anywhere (CLAUDE.md) and a 10 MB ceiling, checked here before
 *  the upload starts — a fast local error, not a wait for the server to
 *  reject it. */
export function validateDocumentFile(file: File): string | null {
  if (file.type.toLowerCase().startsWith('audio/')) return 'Audio files cannot be attached.'
  if (file.size > MAX_SIZE_BYTES) return 'File is larger than 10 MB.'
  if (file.size === 0) return 'File is empty.'
  return null
}

/**
 * Uploads to the private "documents" Storage bucket, then records the
 * metadata row. The document id is generated client-side (unlike most
 * tables, where only client_record_id is) because the storage key needs to
 * be known before the upload call — same reasoning client_record_id exists
 * everywhere else, just needed one column earlier here. If the metadata
 * insert fails after a successful upload, the object is orphaned in
 * Storage rather than retried — a disclosed, low-stakes limitation (no
 * money or business state involved), not a two-phase commit.
 */
export async function uploadDocument(input: UploadDocumentInput): Promise<string> {
  // Compress before validating: a large-but-compressible phone photo
  // should get the chance to land under the 10 MB ceiling rather than
  // being rejected on its original size.
  const file = await compressImageFile(input.file)

  const validationError = validateDocumentFile(file)
  if (validationError) throw new Error(validationError)

  const id = crypto.randomUUID()
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storageKey = `${input.ownerType}/${input.ownerId}/${id}-${safeFilename}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storageKey, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('documents').insert({
    id,
    client_record_id: crypto.randomUUID(),
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    doc_type: input.docType,
    storage_key: storageKey,
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    uploaded_by: input.uploadedBy,
  })
  if (insertError) throw insertError

  return id
}

/** Private bucket — a plain public URL would 404. Short-lived signed URL,
 *  generated on demand when someone actually opens a document rather than
 *  up front for a whole list. */
export async function getDocumentUrl(storageKey: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storageKey, 60)
  if (error) throw error
  return data.signedUrl
}
