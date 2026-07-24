// Authenticated download proxy for Documents. The service account reads the
// file from Drive and this route streams the bytes back, so an approved member's
// browser never talks to Google directly — site auth is the only gate. Every
// request is checked against the configured root folder via assertWithinRoot; a
// file outside that subtree is treated as Not Found (404, not 403, so the route
// never confirms the existence of files it must not serve).

import { requireApproved } from '@/lib/authz'
import { getPortalSettings } from '@/lib/portal'
import {
  getDriveClient,
  extractDriveFolderId,
  DriveNotWithinRootError,
  DriveApiError,
} from '@/lib/drive/client'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** Strip characters that would break the Content-Disposition header. */
const sanitize = (name: string) => name.replace(/["\r\n]/g, '').trim() || 'download'

export async function GET(request: Request): Promise<Response> {
  // Redirects a signed-out visitor to /sign-in; only approved members proceed.
  await requireApproved()

  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!id) return new Response('Missing file id', { status: 400 })

  const settings = await getPortalSettings()
  const rootId = extractDriveFolderId(settings.driveUrl)
  if (!rootId) return new Response('No Drive folder configured', { status: 404 })

  const drive = getDriveClient()
  try {
    // Security boundary first: prove the file lives under the root folder.
    await drive.assertWithinRoot(id, rootId)
    const meta = await drive.getFileMeta(id)
    if (meta.mimeType === FOLDER_MIME) {
      return new Response('Not a file', { status: 400 })
    }

    const dl = await drive.fetchFileContent(id, meta.mimeType)
    const filename = sanitize(meta.name + dl.exportExtension)
    const headers = new Headers({
      'Content-Type': dl.contentType,
      // ASCII fallback + UTF-8 form for non-ASCII names.
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,
      'Cache-Control': 'private, no-store',
    })
    if (dl.contentLength != null) headers.set('Content-Length', String(dl.contentLength))
    return new Response(dl.body, { status: 200, headers })
  } catch (err) {
    // Anything outside the root subtree — or a missing file — is a 404.
    if (err instanceof DriveNotWithinRootError) return new Response('Not found', { status: 404 })
    if (err instanceof DriveApiError && err.status === 404) {
      return new Response('Not found', { status: 404 })
    }
    throw err
  }
}
