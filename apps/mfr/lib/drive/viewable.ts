// Which Drive files the Documents viewer can render inline in the browser,
// keyed by the *served* Content-Type — i.e. the result of `finalContentType`
// (./client), so a Google Doc has already resolved to application/pdf here.
//
// Anything not on this safelist is download-only. That is deliberate for
// text/html and image/svg+xml: served inline from our own origin they could
// execute script, so they must never be previewed — only downloaded.

export type ViewerKind = 'pdf' | 'image' | 'video'

// text/plain rides the same <iframe> path as PDF.
const PDF_TYPES = new Set(['application/pdf', 'text/plain'])
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4'])

/**
 * The inline viewer element a file can be shown with, or `null` if it must be
 * downloaded instead. Pass the served Content-Type (see `finalContentType`);
 * any parameters (`; charset=…`) and casing are ignored.
 */
export function viewerKind(contentType: string): ViewerKind | null {
  const ct = contentType.split(';')[0].trim().toLowerCase()
  if (PDF_TYPES.has(ct)) return 'pdf'
  if (IMAGE_TYPES.has(ct)) return 'image'
  if (VIDEO_TYPES.has(ct)) return 'video'
  return null
}
