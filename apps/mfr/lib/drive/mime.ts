// Pure Drive MIME helpers — NO dependencies. This lives apart from ./client so
// the client-side Documents browser can import `finalContentType` without
// pulling google-auth-library (and its Node `fs`/`net`/`tls`) into the browser
// bundle. The Drive client and download route share these too.

export const FOLDER_MIME = 'application/vnd.google-apps.folder'

// Google-native docs cannot be downloaded raw (`alt=media`); they must be
// exported to a real format.
export const GOOGLE_EXPORT: Record<string, { mimeType: string; ext: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.drawing': { mimeType: 'image/png', ext: '.png' },
}
export const DEFAULT_EXPORT = { mimeType: 'application/pdf', ext: '.pdf' }

export const isGoogleNative = (mimeType: string) =>
  mimeType.startsWith('application/vnd.google-apps.') && mimeType !== FOLDER_MIME

/**
 * The Content-Type the download proxy will actually serve for a Drive file,
 * accounting for Google-native export (Doc/Slides → PDF, Sheet → xlsx,
 * Drawing → PNG). For binary files it is the file's own mimeType. This is the
 * type callers should reason about when deciding whether a file can be previewed
 * inline — see `viewerKind` in ./viewable.
 */
export function finalContentType(mimeType: string): string {
  if (isGoogleNative(mimeType)) return (GOOGLE_EXPORT[mimeType] ?? DEFAULT_EXPORT).mimeType
  return mimeType
}
