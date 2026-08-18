import { useEffect, useRef, useState } from 'react'
import { DOCUMENT_TYPE_LABELS } from '@/constants/labels'
import type { DocumentItem, DocumentOwnerType, DocumentType } from '@/lib/documents'
import { fetchDocuments, getDocumentUrl, uploadDocument, validateDocumentFile } from '@/lib/documents'

interface DocumentPanelProps {
  ownerType: DocumentOwnerType
  ownerId: string
  currentUserId: string
  /** Restricts the type dropdown to what's relevant on this screen — e.g. a
   *  vehicle profile has no business offering "Bill of lading." Falls back
   *  to every document_type value when omitted, so the two original call
   *  sites (Future Purchases) keep their existing behaviour unchanged. */
  allowedTypes?: DocumentType[]
}

const ALL_DOC_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]

/** Shared by every screen that attaches documents — Future Purchases
 *  (Phase 10), vehicle/driver/agreement profiles (desktop only), and now
 *  a receipt/problem-photo step on two mobile flows (Other Payment,
 *  Maintenance order) plus their desktop-reachable detail screens. Real
 *  upload to the private "documents" Storage bucket; the mobile role
 *  bucket policies that make this work for Collections & Finance /
 *  Maintenance & Repairs were added alongside this mobile usage — see
 *  the migration adding documents_bucket_*_mobile policies. */
export function DocumentPanel({ ownerType, ownerId, currentUserId, allowedTypes }: DocumentPanelProps) {
  const docTypes = allowedTypes && allowedTypes.length > 0 ? allowedTypes : ALL_DOC_TYPES
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null)
  // Unscoped callers (the original two Future Purchases screens) keep their
  // original 'OTHER' default exactly; a scoped caller defaults to whichever
  // type it lists first.
  const [docType, setDocType] = useState<DocumentType>(allowedTypes?.[0] ?? 'OTHER')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchDocuments(ownerType, ownerId)
      .then((d) => {
        if (!cancelled) setDocuments(d)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load documents.')
      })
    return () => {
      cancelled = true
    }
  }, [ownerType, ownerId])

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const validationError = validateDocumentFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)
    setError(null)
    try {
      await uploadDocument({ ownerType, ownerId, docType, file, uploadedBy: currentUserId })
      const refreshed = await fetchDocuments(ownerType, ownerId)
      setDocuments(refreshed)
    } catch {
      setError('Could not upload this file. Try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleOpen(doc: DocumentItem) {
    try {
      const url = await getDocumentUrl(doc.storageKey)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Could not open this document.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {documents === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {documents?.length === 0 && <p className="text-sm text-slate-500">No documents attached yet.</p>}

      <ul className="flex flex-col gap-1">
        {documents?.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => handleOpen(doc)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm active:bg-slate-50"
            >
              <span className="text-primary-700 underline decoration-primary-200">{doc.filename}</span>
              <span className="text-slate-500">{DOCUMENT_TYPE_LABELS[doc.docType]}</span>
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocumentType)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {docTypes.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input ref={fileInputRef} type="file" onChange={handleFileChosen} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : '+ Attach a document'}
        </button>
      </div>
    </div>
  )
}
