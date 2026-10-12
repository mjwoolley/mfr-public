// Requirements coverage (CAP-014 Add photos): only approved members can add
// photos. Uses the REAL approval gate (lib/authz → createPortalStatusGate) with
// a signed-in account that is still awaiting approval, against both steps of
// an upload: the upload-token route (the browser's permission to send the
// original) and finalizeUpload (which stores it). Storage, processing and the
// database client are mocked so any attempted write would be observed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authMock, db, blob, normalizeImage, backupObject, handleUpload } = vi.hoisted(() => ({
  authMock: vi.fn(),
  db: { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), select: vi.fn() },
  blob: { putGalleryImage: vi.fn(), deleteBlobObject: vi.fn(), fetchBlobBytes: vi.fn() },
  normalizeImage: vi.fn(),
  backupObject: vi.fn(),
  handleUpload: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/portalDb', () => ({ portalDb: db }))
vi.mock('@/lib/photos/blobStore', () => blob)
vi.mock('@/lib/photos/imageProcess', () => ({ normalizeImage }))
vi.mock('@/lib/photos/backupStore', () => ({ backupObject }))
vi.mock('@vercel/blob/client', () => ({ handleUpload }))

import { finalizeUpload } from './actions'
import { POST } from '../api/photos/upload-token/route'

const pendingSession = {
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'new@example.com',
    status: 'pending',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
  },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue(pendingSession)
})

describe('CAP-014 Add photos — approval gate', () => {
  it('CAP-014 · Only approved members can add photos — the upload itself is refused', async () => {
    handleUpload.mockImplementation(
      async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: () => Promise<unknown> }) => {
        await onBeforeGenerateToken()
        return { type: 'token' }
      },
    )
    const res = await POST(
      new Request('https://x/api/photos/upload-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'blob.generate-client-token' }),
      }),
    )
    expect(res.status).toBe(400)
    // Refused by the approval gate (a redirect away), not by anything else.
    expect((await res.json()).error).toMatch(/NEXT_REDIRECT/)
  })

  it('CAP-014 · Only approved members can add photos — finishing an upload is refused and nothing is saved', async () => {
    await expect(
      finalizeUpload({
        url: 'https://blob/gallery-tmp/a.jpg',
        year: 2026,
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(/NEXT_REDIRECT/)

    expect(blob.fetchBlobBytes).not.toHaveBeenCalled()
    expect(normalizeImage).not.toHaveBeenCalled()
    expect(blob.putGalleryImage).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(backupObject).not.toHaveBeenCalled()
  })
})
