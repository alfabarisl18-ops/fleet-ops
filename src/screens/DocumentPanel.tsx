import { useEffect, useRef, useState } from 'react'
import { DOCUMENT_TYPE_LABELS } from '@/constants/labels'
import type { DocumentItem, DocumentOwnerType, DocumentType } from '@/lib/documents'
import { fetchDocuments, getDocumentUrl, uploadDocument, validateDocumentFile } from '@/lib/documents'

interface DocumentPanelProps {
  ownerType: DocumentOwnerType
  ownerId: string
  currentUserId: string
}

const DOC_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]

/** Shared between PurchaseGoalDetailScreen and PlannedVehicleDetailScreen —
 *  SPEC calls for document attachment on both. Real upload to the private
 *  "documents" Storage bucket (Phase 10, decision 0015) — desktop only. */
export function DocumentPanel({ ownerType, ownerId, currentUserId }: DocumentPanelProps) {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null)
  const [docType, setDocType] = useState<DocumentType>('OTHER')
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
          {DOC_TYPES.map((t) => (
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
