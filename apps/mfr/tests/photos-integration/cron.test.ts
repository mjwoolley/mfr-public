// Integration: the daily photo-backup cron route. Blob fetch + R2 wrapper are
// mocked; DB reads/writes are real. Covers auth, reconcile, and purge.

import { it, expect, afterEach, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
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

function req(auth?: string) {
  return new Request('https://x/api/cron/photo-backup', {
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
})

afterEach(async () => {
  fetchBlobBytes.mockReset()
  backupObject.mockReset()
  deleteBackupObject.mockReset()
  await testDb.delete(portalPhotos)
  await testDb.delete(portalBlobBackups)
})

it('rejects a missing or wrong secret', async () => {
  expect((await GET(req())).status).toBe(401)
  expect((await GET(req('Bearer nope'))).status).toBe(401)
  expect(backupObject).not.toHaveBeenCalled()
})

it('reconciles a photo that has no backup row yet', async () => {
  await testDb.insert(portalPhotos).values({
    year: 2026,
    blobUrl: 'https://blob/gallery/2026/a.jpg',
    blobPathname: 'gallery/2026/a.jpg',
    filename: 'a.jpg',
    uploadedBy: 'user-me',
  })
  fetchBlobBytes.mockResolvedValue(Buffer.from('bytes'))
  backupObject.mockResolvedValue(true)

  const res = await GET(req(`Bearer ${SECRET}`))
  const body = await res.json()
  expect(body).toMatchObject({ ok: true, backedUp: 1 })

  const [backup] = await testDb
    .select()
    .from(portalBlobBackups)
    .where(eq(portalBlobBackups.blobPathname, 'gallery/2026/a.jpg'))
  expect(backup).toBeTruthy()
})

it('purges a backup whose recovery window has expired', async () => {
  const expired = new Date(Date.now() - (BACKUP_RETENTION_DAYS + 10) * 24 * 60 * 60 * 1000)
  await testDb.insert(portalBlobBackups).values({
    blobPathname: 'gallery/2026/old.jpg',
    backupKey: 'gallery/2026/old.jpg',
    byteSize: 10,
    deletedAt: expired,
  })
  deleteBackupObject.mockResolvedValue(true)

  const res = await GET(req(`Bearer ${SECRET}`))
  const body = await res.json()
  expect(body).toMatchObject({ ok: true, purged: 1 })
  expect(deleteBackupObject).toHaveBeenCalledWith('gallery/2026/old.jpg')
  expect(await testDb.select().from(portalBlobBackups)).toHaveLength(0)
})

it('keeps a backup still inside the recovery window', async () => {
  await testDb.insert(portalBlobBackups).values({
    blobPathname: 'gallery/2026/recent.jpg',
    backupKey: 'gallery/2026/recent.jpg',
    byteSize: 10,
    deletedAt: new Date(),
  })
  const res = await GET(req(`Bearer ${SECRET}`))
  const body = await res.json()
  expect(body.purged).toBe(0)
  expect(deleteBackupObject).not.toHaveBeenCalled()
  expect(await testDb.select().from(portalBlobBackups)).toHaveLength(1)
})

it('skips a photo that already has a backup row', async () => {
  await testDb.insert(portalPhotos).values({
    year: 2026,
    blobUrl: 'https://blob/gallery/2026/have.jpg',
    blobPathname: 'gallery/2026/have.jpg',
    filename: 'have.jpg',
    uploadedBy: 'user-me',
  })
  await testDb.insert(portalBlobBackups).values({
    blobPathname: 'gallery/2026/have.jpg',
    backupKey: 'gallery/2026/have.jpg',
    byteSize: 5,
  })
  const res = await GET(req(`Bearer ${SECRET}`))
  expect((await res.json()).backedUp).toBe(0)
  expect(fetchBlobBytes).not.toHaveBeenCalled()
})

it('does not record a backup when the R2 upload fails', async () => {
  await testDb.insert(portalPhotos).values({
    year: 2026,
    blobUrl: 'https://blob/gallery/2026/fail.jpg',
    blobPathname: 'gallery/2026/fail.jpg',
    filename: 'fail.jpg',
    uploadedBy: 'user-me',
  })
  fetchBlobBytes.mockResolvedValue(Buffer.from('bytes'))
  backupObject.mockResolvedValue(false)
  const res = await GET(req(`Bearer ${SECRET}`))
  expect((await res.json()).backedUp).toBe(0)
  expect(await testDb.select().from(portalBlobBackups)).toHaveLength(0)
})

it('tolerates a blob fetch error during reconcile', async () => {
  await testDb.insert(portalPhotos).values({
    year: 2026,
    blobUrl: 'https://blob/gallery/2026/gone.jpg',
    blobPathname: 'gallery/2026/gone.jpg',
    filename: 'gone.jpg',
    uploadedBy: 'user-me',
  })
  fetchBlobBytes.mockRejectedValue(new Error('404'))
  const res = await GET(req(`Bearer ${SECRET}`))
  expect(res.status).toBe(200)
  expect((await res.json()).backedUp).toBe(0)
})

it('keeps the backup row when the R2 delete fails', async () => {
  const expired = new Date(Date.now() - (BACKUP_RETENTION_DAYS + 10) * 24 * 60 * 60 * 1000)
  await testDb.insert(portalBlobBackups).values({
    blobPathname: 'gallery/2026/stuck.jpg',
    backupKey: 'gallery/2026/stuck.jpg',
    byteSize: 10,
    deletedAt: expired,
  })
  deleteBackupObject.mockResolvedValue(false)
  const res = await GET(req(`Bearer ${SECRET}`))
  expect((await res.json()).purged).toBe(0)
  expect(await testDb.select().from(portalBlobBackups)).toHaveLength(1)
})
