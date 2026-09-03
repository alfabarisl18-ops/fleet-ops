import { useEffect, useRef, useState } from 'react'
import { DOCUMENT_TYPE_LABELS } from '@/constants/labels'
import { PhotoViewerModal } from '@/components/PhotoViewerModal'
import type { DocumentItem, DocumentOwnerType, DocumentType } from '@/lib/documents'
import { fetchDocuments, getDocumentUrl, getDocumentUrls, uploadDocument, validateDocumentFile } from '@/lib/documents'

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

/** Shortens a filename for the row — just enough to identify the photo,
 *  not the whole string (real names, especially phone-camera screenshots,
 *  can run much longer than what a list row needs). Breaks at the last
 *  word boundary at or before the limit rather than mid-word, so
 *  "Dark_Light Mode Toggle (Switch)..." becomes "Dark_Light Mode Toggle…"
 *  instead of an arbitrary character cut. The full name is still available
 *  via the row's title tooltip and inside the photo popup. */
function truncateFilename(name: string, maxLength = 24): string {
  if (name.length <= maxLength) return name
  const cut = name.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`
}

/** Fetches thumbnail signed URLs for every image document in one batched
 *  request. A document Supabase can't resolve a URL for — most notably a
 *  row whose Storage object was deleted outside the app — is simply left
 *  out; its row falls back to the generic file icon instead of erroring. */
async function loadThumbnails(docs: DocumentItem[]): Promise<Record<string, string>> {
  const imageKeys = docs.filter((d) => d.mimeType.startsWith('image/')).map((d) => d.storageKey)
  if (imageKeys.length === 0) return {}
  try {
    return await getDocumentUrls(imageKeys)
  } catch {
    return {}
  }
}

/** Shared by every screen that attaches documents — Future Purchases
 *  (Phase 10), vehicle/driver/agreement profiles (desktop only), and now
 *  a receipt/problem-photo step on two mobile flows (Other Payment,
 *  Maintenance order) plus their desktop-reachable detail screens. Real
 *  upload to the private "documents" Storage bucket; the mobile role
 *  bucket policies that make this work for Collections & Finance /
 *  Maintenance & Repairs were added alongside this mobile usage — see
 *  the migration adding documents_bucket_*_mobile policies.
 *
 *  Image documents show a thumbnail and open in an in-app popup
 *  (PhotoViewerModal) instead of a new browser tab; everything else
 *  (PDFs, scans) keeps opening in a new tab via a signed URL, unchanged. */
export function DocumentPanel({ ownerType, ownerId, currentUserId, allowedTypes }: DocumentPanelProps) {
  const docTypes = allowedTypes && allowedTypes.length > 0 ? allowedTypes : ALL_DOC_TYPES
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [viewingDoc, setViewingDoc] = useState<DocumentItem | null>(null)
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
        if (cancelled) return
        setDocuments(d)
        loadThumbnails(d).then((t) => {
          if (!cancelled) setThumbnails(t)
        })
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
      setThumbnails(await loadThumbnails(refreshed))
    } catch {
      setError('Could not upload this file. Try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleOpen(doc: DocumentItem) {
    if (doc.mimeType.startsWith('image/')) {
      setViewingDoc(doc)
      return
    }
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
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm active:bg-slate-50"
            >
              {thumbnails[doc.storageKey] ? (
                <img
                  src={thumbnails[doc.storageKey]}
                  alt=""
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="h-6 w-6"
                  >
                    <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z" />
                    <path d="M14 3.5V8h4" />
                  </svg>
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-primary-700" title={doc.filename}>
                {truncateFilename(doc.filename)}
              </span>
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

      {/* Keyed by document id so opening a different photo mounts a fresh
          instance — its url/error state starts clean rather than needing a
          manual reset inside the effect (which would call setState
          synchronously in the effect body). */}
      <PhotoViewerModal key={viewingDoc?.id ?? 'closed'} document={viewingDoc} onClose={() => setViewingDoc(null)} />
    </div>
  )
}
