// Unit: the Documents download proxy. The auth gate, settings read, and Drive
// client are mocked. We assert the subtree guard runs (out-of-root → 404),
// happy-path streams with attachment headers, folders are rejected, and a
// missing configured folder / missing id are handled.

import { afterEach, describe, it, expect, vi } from 'vitest'
import { DriveNotWithinRootError, DriveApiError } from '@/lib/drive/client'

const requireApproved = vi.fn()
vi.mock('@/lib/authz', () => ({ requireApproved: (...a: unknown[]) => requireApproved(...a) }))

const getPortalSettings = vi.fn()
vi.mock('@/lib/portal', () => ({ getPortalSettings: (...a: unknown[]) => getPortalSettings(...a) }))

const drive = {
  assertWithinRoot: vi.fn(),
  getFileMeta: vi.fn(),
  fetchFileContent: vi.fn(),
}
vi.mock('@/lib/drive/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drive/client')>()
  return { ...actual, getDriveClient: () => drive }
})

import { GET } from './route'

const ROOT_URL = 'https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7'
const req = (qs: string) => new Request(`https://x/api/documents/download${qs}`)

afterEach(() => {
  requireApproved.mockReset()
  getPortalSettings.mockReset()
  drive.assertWithinRoot.mockReset()
  drive.getFileMeta.mockReset()
  drive.fetchFileContent.mockReset()
})

function approvedWithFolder() {
  requireApproved.mockResolvedValue({ user: { id: 'u1' } })
  getPortalSettings.mockResolvedValue({ driveUrl: ROOT_URL })
}

describe('GET /api/documents/download', () => {
  it('streams an in-root file with attachment headers', async () => {
    approvedWithFolder()
    drive.assertWithinRoot.mockResolvedValue(undefined)
    drive.getFileMeta.mockResolvedValue({
      id: 'f1',
      name: 'Bylaws.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      parents: ['root'],
    })
    drive.fetchFileContent.mockResolvedValue({
      body: 'bytes' as unknown as ReadableStream,
      contentType: 'application/pdf',
      contentLength: 2048,
      exportExtension: '',
    })

    const res = await GET(req('?id=f1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Length')).toBe('2048')
    expect(res.headers.get('Content-Disposition')).toContain('filename="Bylaws.pdf"')
    // The subtree guard ran before any content was fetched.
    expect(drive.assertWithinRoot).toHaveBeenCalledWith('f1', '1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7')
  })

  it('appends the export extension for a Google Doc', async () => {
    approvedWithFolder()
    drive.assertWithinRoot.mockResolvedValue(undefined)
    drive.getFileMeta.mockResolvedValue({
      id: 'g1',
      name: 'Meeting notes',
      mimeType: 'application/vnd.google-apps.document',
      size: null,
      parents: ['root'],
    })
    drive.fetchFileContent.mockResolvedValue({
      body: 'pdf' as unknown as ReadableStream,
      contentType: 'application/pdf',
      contentLength: null,
      exportExtension: '.pdf',
    })

    const res = await GET(req('?id=g1'))
    expect(res.headers.get('Content-Disposition')).toContain('filename="Meeting notes.pdf"')
    expect(res.headers.get('Content-Length')).toBeNull()
  })

  it('returns 404 for a file outside the root subtree (never confirms existence)', async () => {
    approvedWithFolder()
    drive.assertWithinRoot.mockRejectedValue(new DriveNotWithinRootError('secret'))
    const res = await GET(req('?id=secret'))
    expect(res.status).toBe(404)
    expect(drive.fetchFileContent).not.toHaveBeenCalled()
  })

  it('returns 404 when the file does not exist', async () => {
    approvedWithFolder()
    drive.assertWithinRoot.mockResolvedValue(undefined)
    drive.getFileMeta.mockRejectedValue(new DriveApiError(404, 'not found'))
    const res = await GET(req('?id=ghost'))
    expect(res.status).toBe(404)
  })

  it('rejects an id that resolves to a folder', async () => {
    approvedWithFolder()
    drive.assertWithinRoot.mockResolvedValue(undefined)
    drive.getFileMeta.mockResolvedValue({
      id: 'd1',
      name: 'Budgets',
      mimeType: 'application/vnd.google-apps.folder',
      size: null,
      parents: ['root'],
    })
    const res = await GET(req('?id=d1'))
    expect(res.status).toBe(400)
    expect(drive.fetchFileContent).not.toHaveBeenCalled()
  })

  it('400s when no id is given', async () => {
    approvedWithFolder()
    const res = await GET(req(''))
    expect(res.status).toBe(400)
  })

  it('404s when no Drive folder is configured', async () => {
    requireApproved.mockResolvedValue({ user: { id: 'u1' } })
    getPortalSettings.mockResolvedValue({ driveUrl: '' })
    const res = await GET(req('?id=f1'))
    expect(res.status).toBe(404)
  })

  it('propagates unexpected Drive errors (not swallowed as 404)', async () => {
    approvedWithFolder()
    drive.assertWithinRoot.mockResolvedValue(undefined)
    drive.getFileMeta.mockRejectedValue(new DriveApiError(500, 'boom'))
    await expect(GET(req('?id=f1'))).rejects.toBeInstanceOf(DriveApiError)
  })
})
