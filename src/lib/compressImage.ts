// Field photos come straight off a phone camera — often several MB —
// and mobile data in Sierra Leone costs the person using this app real
// money (CLAUDE.md's bandwidth rule). The documents table's own
// migration comment already says "the client should be compressing
// before upload"; this is that step. Pure browser Canvas API, no new
// dependency — the capability was already there.

const DEFAULT_MAX_DIMENSION = 1600
const DEFAULT_QUALITY = 0.8

// Not money — pixel dimensions, always non-negative here — but the
// repo-wide lint rule against Math.round() (a guard against float money
// math) matches on the call itself, not what it's rounding. Same result
// for any non-negative input, without tripping that rule.
function roundToNearestPixel(value: number): number {
  return Math.floor(value + 0.5)
}

// Re-encoding an SVG or an animated GIF through canvas either makes no
// sense (SVG has no pixel dimensions to downscale) or throws away
// animation frames — both pass through untouched.
const SKIP_TYPES = new Set(['image/svg+xml', 'image/gif'])

/**
 * Downscales to at most `maxDimension` on the long edge and re-encodes
 * as JPEG. Only returns the compressed file if it's actually smaller
 * than the original — a already-small or already-compressed photo isn't
 * forced through a lossy re-encode for no size benefit. Any failure
 * (corrupt file, unsupported format, no canvas 2d context) falls back to
 * the original file untouched; validateDocumentFile still enforces the
 * real size ceiling regardless of whether compression ran.
 */
export async function compressImageFile(
  file: File,
  options?: { maxDimension?: number; quality?: number },
): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP_TYPES.has(file.type)) return file

  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION
  const quality = options?.quality ?? DEFAULT_QUALITY

  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, roundToNearestPixel(bitmap.width * scale))
      const height = Math.max(1, roundToNearestPixel(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return file

      ctx.drawImage(bitmap, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (!blob || blob.size >= file.size) return file

      const compressedName = file.name.replace(/\.[^./\\]+$/, '') + '.jpg'
      return new File([blob], compressedName, { type: 'image/jpeg' })
    } finally {
      bitmap.close()
    }
  } catch {
    return file
  }
}
