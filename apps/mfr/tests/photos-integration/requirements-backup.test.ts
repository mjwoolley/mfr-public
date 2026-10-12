// Requirements coverage (CAP-019 Photo backup and recovery): the daily backup
// check's 30-day retention edge, and that an unauthorised caller changes
// nothing. Blob fetch and the R2 wrapper are mocked; DB rows are real.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { testDb } from './testDb'
import { portalPhotos, portalBlobBackups } from '../../lib/db/schema'
import { BACKUP_RETENTION_DAYS } from '../../lib/photos/constants'

const fetchBlobBytes = vi.fn()
vi.mock('../../lib/photos/blobStore', () => ({
  fetchBlobBytes: (...a: unknown[]) => fetchBlobBytes(...a),
}))

const backupObject = vi.fn()
const deleteBackupObject = vi.fn()
vi.mock('../../lib/photos/backupStore', () => ({
  backupObject: (...a: unknown[]) => backupObject(...a),
  deleteBackupObject: (...a: unknown[]) => deleteBackupObject(...a),
}))

import { GET } from '../../app/api/cron/photo-backup/route'

const SECRET = 'test-cron-secret'
const DAY = 24 * 60 * 60 * 1000
const MINUTE = 60 * 1000

function req(authorization?: string) {
  return new Request('https://x/api/cron/photo-backup', {
    headers: authorization ? { authorization } : {},
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  deleteBackupObject.mockResolvedValue(true)
  backupObject.mockResolvedValue(true)
  fetchBlobBytes.mockResolvedValue(Buffer.from('bytes'))
})

afterEach(async () => {
  fetchBlobBytes.mockReset()
  backupObject.mockReset()
  deleteBackupObject.mockReset()
  await testDb.delete(portalPhotos)
  await testDb.delete(portalBlobBackups)
})

async function deletedBackup(pathname: string, ageMs: number) {
  await testDb.insert(portalBlobBackups).values({
    blobPathname: pathname,
    backupKey: pathname,
    byteSize: 10,
    deletedAt: new Date(Date.now() - ageMs),
  })
}

describe('CAP-019 · A deleted photo’s backup is kept for 30 days', () => {
  it('CAP-019 · A deleted photo’s backup is kept for 30 days — 30 days or less is kept, more than 30 days is removed', async () => {
    expect(BACKUP_RETENTION_DAYS).toBe(30)
    await deletedBackup('gallery/2026/just-inside.jpg', 30 * DAY - 5 * MINUTE)
    await deletedBackup('gallery/2026/just-outside.jpg', 30 * DAY + 5 * MINUTE)

    const res = await GET(req(`Bearer ${SECRET}`))
    expect(await res.json()).toMatchObject({ ok: true, purged: 1 })

    expect(deleteBackupObject).toHaveBeenCalledTimes(1)
    expect(deleteBackupObject).toHaveBeenCalledWith('gallery/2026/just-outside.jpg')
    const left = await testDb.select().from(portalBlobBackups)
    expect(left.map((b) => b.blobPathname)).toEqual(['gallery/2026/just-inside.jpg'])
  })
})

describe('CAP-019 · Only the scheduled job can run the backup check', () => {
  it('CAP-019 · Only the scheduled job can run the backup check — nothing is backed up or removed', async () => {
    await testDb.insert(portalPhotos).values({
      year: 2026,
      blobUrl: 'https://blob/gallery/2026/new.jpg',
      blobPathname: 'gallery/2026/new.jpg',
      filename: 'new.jpg',
      uploadedBy: 'user-me',
    })
    await deletedBackup('gallery/2026/expired.jpg', 40 * DAY)

    for (const authorization of [undefined, 'Bearer wrong', SECRET]) {
      expect((await GET(req(authorization))).status).toBe(401)
    }
    expect(fetchBlobBytes).not.toHaveBeenCalled()
    expect(backupObject).not.toHaveBeenCalled()
    expect(deleteBackupObject).not.toHaveBeenCalled()
    const left = await testDb.select().from(portalBlobBackups)
    expect(left.map((b) => b.blobPathname)).toEqual(['gallery/2026/expired.jpg'])
  })
})
