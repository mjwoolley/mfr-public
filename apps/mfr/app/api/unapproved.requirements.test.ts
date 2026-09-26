// Requirement coverage for CAP-003 · Unapproved accounts cannot act behind the
// screens (requirements/accounts/access-for-unapproved-accounts.md): the
// photo-upload token route, the save-uploaded-photo action and the
// document-download route, driven with the REAL
// approval gate (lib/authz) — only the session source is stubbed — so a
// pending or blocked caller is refused before Blob or Drive is touched.
// (Booking/changing/cancelling is in tests/reservations-integration/
// requirements-unapproved.test.ts; meal marks in
// tests/integration/requirements-accounts.test.ts.)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

// Upload: handleUpload asks the route's onBeforeGenerateToken for permission
// before it signs anything; the token is only minted if that resolves.
const { handleUpload, mintToken } = vi.hoisted(() => ({
  handleUpload: vi.fn(),
  mintToken: vi.fn(() => ({ type: 'blob.generate-client-token', clientToken: 'tok' })),
}))
vi.mock('@vercel/blob/client', () => ({ handleUpload }))

// Download: the settings read and Drive client must never be reached.
const { getPortalSettings, drive } = vi.hoisted(() => ({
  getPortalSettings: vi.fn(),
  drive: { assertWithinRoot: vi.fn(), getFileMeta: vi.fn(), fetchFileContent: vi.fn() },
}))
vi.mock('@/lib/portal', () => ({ getPortalSettings }))
vi.mock('@/lib/drive/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drive/client')>()
  return { ...actual, getDriveClient: () => drive }
})

// Finalizing an upload: nothing may be fetched, stored or written.
const { photoSideEffect } = vi.hoisted(() => ({ photoSideEffect: vi.fn() }))
vi.mock('@/lib/portalDb', () => ({
  portalDb: new Proxy({}, { get: (_t, prop) => () => photoSideEffect(`portalDb.${String(prop)}`) }),
}))
vi.mock('@/lib/photos/blobStore', () => ({
  putGalleryImage: () => photoSideEffect('putGalleryImage'),
  deleteBlobObject: () => photoSideEffect('deleteBlobObject'),
  fetchBlobBytes: () => photoSideEffect('fetchBlobBytes'),
}))
vi.mock('@/lib/photos/imageProcess', () => ({ normalizeImage: () => photoSideEffect('normalize') }))
vi.mock('@/lib/photos/backupStore', () => ({ backupObject: () => photoSideEffect('backup') }))
vi.mock('@/lib/photos/logPhotoActivity', () => ({
  logPhotoActivity: () => photoSideEffect('activity'),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST as uploadToken } from './photos/upload-token/route'
import { finalizeUpload } from '../photos/actions'
import { GET as download } from './documents/download/route'

const session = (status: 'pending' | 'blocked' | 'approved') => ({
  user: {
    id: 'ann-1',
    email: 'ann@example.com',
    status,
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
  },
  expires: '2099-01-01',
})

beforeEach(() => {
  vi.clearAllMocks()
  handleUpload.mockImplementation(
    async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: () => Promise<unknown> }) => {
      await onBeforeGenerateToken()
      return mintToken()
    },
  )
})

const uploadRequest = () =>
  new Request('https://x/api/photos/upload-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'blob.generate-client-token' }),
  })

describe('CAP-003 · Unapproved accounts cannot act behind the screens', () => {
  it.each(['pending', 'blocked'] as const)(
    'CAP-003 · a %s account cannot get a photo upload token',
    async (status) => {
      authMock.mockResolvedValue(session(status))

      const res = await uploadToken(uploadRequest())

      expect(res.status).toBe(400)
      expect(mintToken).not.toHaveBeenCalled()
      expect(await res.json()).not.toHaveProperty('clientToken')
    },
  )

  it('CAP-003 · an approved member does get a photo upload token (control)', async () => {
    authMock.mockResolvedValue(session('approved'))

    const res = await uploadToken(uploadRequest())

    expect(res.status).toBe(200)
    expect(mintToken).toHaveBeenCalledTimes(1)
  })

  it.each(['pending', 'blocked'] as const)(
    'CAP-003 · a %s account cannot save an uploaded photo',
    async (status) => {
      authMock.mockResolvedValue(session(status))

      await expect(
        finalizeUpload({
          url: 'https://blob.example/gallery-tmp/a.jpg',
          year: 2026,
          filename: 'a.jpg',
          contentType: 'image/jpeg',
        }),
      ).rejects.toThrow('NEXT_REDIRECT:/')
      expect(photoSideEffect).not.toHaveBeenCalled()
    },
  )

  it.each(['pending', 'blocked'] as const)(
    'CAP-003 · a %s account cannot download a document',
    async (status) => {
      authMock.mockResolvedValue(session(status))

      await expect(
        download(new Request('https://x/api/documents/download?id=file-1')),
      ).rejects.toThrow('NEXT_REDIRECT:/')

      expect(getPortalSettings).not.toHaveBeenCalled()
      expect(drive.assertWithinRoot).not.toHaveBeenCalled()
      expect(drive.fetchFileContent).not.toHaveBeenCalled()
    },
  )
})
