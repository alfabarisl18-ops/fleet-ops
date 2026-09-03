import { useEffect, useRef, useState } from 'react'
import { DOCUMENT_TYPE_LABELS } from '@/constants/labels'
import type { DocumentItem } from '@/lib/documents'
import { getDocumentUrl } from '@/lib/documents'

interface PhotoViewerModalProps {
  document: DocumentItem | null
  onClose: () => void
}

/**
 * Small centered popup for viewing a photo in-app instead of opening a new
 * browser tab — matches the app's existing card language (rounded-2xl,
 * white, shadow-lg) rather than a full-screen dark lightbox. Only ever
 * opened for image documents (DocumentPanel gates on mime type before
 * rendering this); a fresh signed URL is fetched each time it opens, same
 * 60-second lifetime as the click-to-open behaviour it replaces.
 *
 * No full focus trap — the repo has no existing modal precedent to build
 * on (the closest, AlertsBell's dropdown, is corner-anchored and isn't a
 * true dialog either). The close button gets initial focus and Escape,
 * backdrop-click, and the visible Back button all close it, which covers
 * the practical need without a new dependency.
 */
export function PhotoViewerModal({ document: doc, onClose }: PhotoViewerModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    getDocumentUrl(doc.storageKey)
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch(() => {
        if (!cancelled) setError('Could not open this document.')
      })
    return () => {
      cancelled = true
    }
  }, [doc])

  useEffect(() => {
    if (!doc) return
    closeButtonRef.current?.focus()
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [doc, onClose])

  if (!doc) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-slate-900/20"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.filename}
        className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col gap-3 rounded-2xl bg-white p-4 shadow-lg"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="flex h-11 w-fit items-center gap-1 rounded-xl px-2 text-sm font-medium text-primary-700 active:bg-slate-50"
        >
          ← Back
        </button>

        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
          {!url && !error && <p className="text-sm text-slate-500">Loading…</p>}
          {error && (
            <p role="alert" className="px-4 text-center text-sm text-red-600">
              {error}
            </p>
          )}
          {url && <img src={url} alt={doc.filename} className="max-h-[65vh] w-full object-contain" />}
        </div>

        <div className="flex flex-col gap-0.5">
          <p className="break-words text-sm font-medium text-slate-900">{doc.filename}</p>
          <p className="text-xs text-slate-500">{DOCUMENT_TYPE_LABELS[doc.docType]}</p>
        </div>
      </div>
    </div>
  )
}
