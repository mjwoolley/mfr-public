// Integration: the member photo-gallery actions against the real test branch.
// auth, next/cache, and the Blob/image/backup wrappers are mocked; DB writes are
// real (portalDb === testDb branch in the test env). Mirrors actions.test.ts.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { desc, eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { portalPhotos, portalBlobBackups, activityLog } from '../../lib/db/schema'
import { getPhotoHistory } from '../../lib/photos/history'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const putGalleryImage = vi.fn()
const deleteBlobObject = vi.fn()
const fetchBlobBytes = vi.fn()
vi.mock('../../lib/photos/blobStore', () => ({
  putGalleryImage: (...a: unknown[]) => putGalleryImage(...a),
  deleteBlobObject: (...a: unknown[]) => deleteBlobObject(...a),
  fetchBlobBytes: (...a: unknown[]) => fetchBlobBytes(...a),
}))

const normalizeImage = vi.fn()
vi.mock('../../lib/photos/imageProcess', () => ({
  normalizeImage: (...a: unknown[]) => normalizeImage(...a),
}))

const backupObject = vi.fn()
vi.mock('../../lib/photos/backupStore', () => ({
  backupObject: (...a: unknown[]) => backupObject(...a),
  deleteBackupObject: vi.fn(),
}))

import { auth } from '@/lib/auth'
import {
  finalizeUpload,
  updatePhoto,
  deletePhoto,
  deletePhotos,
  setFeatured,
} from '../../app/photos/actions'
import { FEATURED_PER_USER } from '../../lib/photos/constants'

// Real UUIDs: these ids are stored both as portal_photos.uploadedBy (text) and
// as activity_log.actor_user_id (uuid), so the history-logging path exercises
// the same shape as production (where session.user.id is an identity UUID).
const ME = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

function mockUser(id: string, roles: { siteOwner?: boolean; siteManager?: boolean } = {}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id,
      status: 'approved',
      roles: {
        siteOwner: roles.siteOwner ?? false,
        siteManager: roles.siteManager ?? false,
        accountingManager: false,
      },
      email: `${id}@example.com`,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

async function seedPhoto(over: Partial<typeof portalPhotos.$inferInsert> = {}) {
  const [row] = await testDb
    .insert(portalPhotos)
    .values({
      year: 2026,
      blobUrl: 'https://blob/x.jpg',
      blobPathname: `gallery/2026/${crypto.randomUUID()}.jpg`,
      filename: 'x.jpg',
      byteSize: 1000,
      width: 800,
      height: 600,
      uploadedBy: ME,
      ...over,
    })
    .returning()
  return row
}

beforeEach(() => {
  // deleteBlobObject is fire-and-forget (`.catch(...)`) in the actions, so it
  // must return a thenable even when a test doesn't care about it.
  deleteBlobObject.mockResolvedValue(undefined)
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const m of [
    putGalleryImage,
    deleteBlobObject,
    fetchBlobBytes,
    normalizeImage,
    backupObject,
  ]) {
    m.mockReset()
  }
  await testDb.delete(portalPhotos)
  await testDb.delete(portalBlobBackups)
  await testDb.delete(activityLog)
})

// Read back the newest photo activity_log row of a given type (helper for the
// history-logging assertions below).
async function latestEvent(eventType: string) {
  const [row] = await testDb
    .select()
    .from(activityLog)
    .where(eq(activityLog.eventType, eventType))
    .orderBy(desc(activityLog.createdAt))
    .limit(1)
  return row
}

describe('finalizeUpload', () => {
  it('normalizes, stores, inserts the row, deletes the temp original, and backs up', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(Buffer.from('original'))
    normalizeImage.mockResolvedValue({
      bytes: Buffer.from('processed-bytes'),
      width: 1600,
      height: 1200,
      contentType: 'image/jpeg',
    })
    putGalleryImage.mockResolvedValue({
      url: 'https://blob/gallery/2026/final.jpg',
      pathname: 'gallery/2026/final.jpg',
    })
    backupObject.mockResolvedValue(true)

    const res = await finalizeUpload({
      url: 'https://blob/gallery-tmp/orig.heic',
      year: 2026,
      filename: 'orig.heic',
      contentType: 'image/heic',
    })
    expect(res).toEqual({ ok: true })

    const rows = await testDb.select().from(portalPhotos)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      year: 2026,
      filename: 'orig.heic',
      width: 1600,
      height: 1200,
      byteSize: 'processed-bytes'.length,
      uploadedBy: ME,
      blobPathname: 'gallery/2026/final.jpg',
    })
    expect(deleteBlobObject).toHaveBeenCalledWith('https://blob/gallery-tmp/orig.heic')

    const backups = await testDb.select().from(portalBlobBackups)
    expect(backups).toHaveLength(1)
    expect(backups[0].blobPathname).toBe('gallery/2026/final.jpg')
  })

  it('files the photo under the EXIF capture year, not the provided year', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(Buffer.from('original'))
    // Uploaded from the 2026 gallery, but the photo was taken in 2019.
    normalizeImage.mockResolvedValue({
      bytes: Buffer.from('processed-bytes'),
      width: 1600,
      height: 1200,
      contentType: 'image/jpeg',
      takenAt: new Date('2019-07-04T12:00:00Z'),
    })
    putGalleryImage.mockResolvedValue({
      url: 'https://blob/gallery/2019/final.jpg',
      pathname: 'gallery/2019/final.jpg',
    })
    backupObject.mockResolvedValue(true)

    const res = await finalizeUpload({
      url: 'https://blob/gallery-tmp/orig.jpg',
      year: 2026,
      filename: 'orig.jpg',
      contentType: 'image/jpeg',
    })
    expect(res).toEqual({ ok: true })

    // The stored path uses the capture year, and the row records it too.
    expect(putGalleryImage).toHaveBeenCalledWith(
      expect.stringMatching(/^gallery\/2019\//),
      expect.anything(),
      'image/jpeg',
    )
    const [row] = await testDb.select().from(portalPhotos)
    expect(row.year).toBe(2019)
  })

  it('rejects an unauthenticated caller', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    await expect(
      finalizeUpload({
        url: 'https://blob/x',
        year: 2026,
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow()
    expect(putGalleryImage).not.toHaveBeenCalled()
  })

  it('rejects an invalid year', async () => {
    mockUser(ME)
    const res = await finalizeUpload({
      url: 'https://blob/x',
      year: 12,
      filename: 'a.jpg',
      contentType: 'image/jpeg',
    })
    expect(res).toEqual({ error: 'Invalid upload' })
  })

  it('cleans up and errors when processing fails', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(Buffer.from('bad'))
    normalizeImage.mockRejectedValue(new Error('bad image'))
    const res = await finalizeUpload({
      url: 'https://blob/gallery-tmp/bad.txt',
      year: 2026,
      filename: 'bad.txt',
      contentType: 'text/plain',
    })
    expect('error' in res).toBe(true)
    expect(deleteBlobObject).toHaveBeenCalledWith('https://blob/gallery-tmp/bad.txt')
    expect(await testDb.select().from(portalPhotos)).toHaveLength(0)
  })
})

describe('updatePhoto', () => {
  it('lets the owner change year and caption', async () => {
    mockUser(ME)
    const row = await seedPhoto()
    const res = await updatePhoto(row.id, { year: 2024, caption: 'On the dock' })
    expect(res).toEqual({ ok: true })
    const [after] = await testDb.select().from(portalPhotos).where(eq(portalPhotos.id, row.id))
    expect(after.year).toBe(2024)
    expect(after.caption).toBe('On the dock')
  })

  it('blocks a non-owner, allows a content-admin', async () => {
    const row = await seedPhoto({ uploadedBy: OTHER })
    mockUser(ME)
    expect(await updatePhoto(row.id, { caption: 'nope' })).toEqual({ error: 'Not your photo' })
    mockUser(ME, { siteManager: true })
    expect(await updatePhoto(row.id, { caption: 'ok by admin' })).toEqual({ ok: true })
  })
})

describe('deletePhoto', () => {
  it('deletes the blob, marks the backup deleted, removes the row', async () => {
    mockUser(ME)
    const row = await seedPhoto()
    await testDb
      .insert(portalBlobBackups)
      .values({ blobPathname: row.blobPathname, backupKey: row.blobPathname, byteSize: 1000 })

    const res = await deletePhoto(row.id)
    expect(res).toEqual({ ok: true })
    expect(deleteBlobObject).toHaveBeenCalledWith(row.blobUrl)
    expect(await testDb.select().from(portalPhotos)).toHaveLength(0)
    const [backup] = await testDb
      .select()
      .from(portalBlobBackups)
      .where(eq(portalBlobBackups.blobPathname, row.blobPathname))
    expect(backup.deletedAt).not.toBeNull()
  })

  it('blocks a non-owner but allows a content-admin', async () => {
    const row = await seedPhoto({ uploadedBy: OTHER })
    mockUser(ME)
    expect(await deletePhoto(row.id)).toEqual({ error: 'Not your photo' })
    expect(await testDb.select().from(portalPhotos)).toHaveLength(1)
    mockUser(ME, { siteOwner: true })
    expect(await deletePhoto(row.id)).toEqual({ ok: true })
  })

  it('is idempotent for a missing photo', async () => {
    mockUser(ME)
    expect(await deletePhoto('00000000-0000-0000-0000-000000000000')).toEqual({ ok: true })
  })
})

describe('deletePhotos (bulk)', () => {
  it('deletes only the caller-owned photos, skipping others', async () => {
    mockUser(ME)
    const a = await seedPhoto({ filename: 'a.jpg' })
    const b = await seedPhoto({ filename: 'b.jpg', year: 2024 })
    const other = await seedPhoto({ uploadedBy: OTHER, filename: 'c.jpg' })

    const res = await deletePhotos([a.id, b.id, other.id])
    expect(res).toEqual({ ok: true })

    const remaining = await testDb.select().from(portalPhotos)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(other.id)
    expect(deleteBlobObject).toHaveBeenCalledTimes(2)
  })

  it('lets a content-admin delete anyone’s, and errors when nothing is deletable', async () => {
    const x = await seedPhoto({ uploadedBy: OTHER })

    mockUser(ME) // non-owner, non-admin
    expect(await deletePhotos([x.id])).toEqual({ error: 'Nothing was deleted.' })
    expect(await testDb.select().from(portalPhotos)).toHaveLength(1)

    mockUser(ME, { siteManager: true }) // content admin
    expect(await deletePhotos([x.id])).toEqual({ ok: true })
    expect(await testDb.select().from(portalPhotos)).toHaveLength(0)
  })

  it('rejects an empty or malformed selection', async () => {
    mockUser(ME)
    expect(await deletePhotos([])).toEqual({ error: 'Invalid selection' })
    expect(await deletePhotos(['not-a-uuid'])).toEqual({ error: 'Invalid selection' })
  })
})

describe('setFeatured', () => {
  it('features and unfeatures the owner’s own photo', async () => {
    mockUser(ME)
    const row = await seedPhoto()
    expect(await setFeatured(row.id, true)).toEqual({ ok: true })
    let [after] = await testDb.select().from(portalPhotos).where(eq(portalPhotos.id, row.id))
    expect(after.featured).toBe(true)
    expect(after.featuredAt).not.toBeNull()

    expect(await setFeatured(row.id, false)).toEqual({ ok: true })
    ;[after] = await testDb.select().from(portalPhotos).where(eq(portalPhotos.id, row.id))
    expect(after.featured).toBe(false)
    expect(after.featuredAt).toBeNull()
  })

  it('enforces the per-user featured cap', async () => {
    mockUser(ME)
    for (let i = 0; i < FEATURED_PER_USER; i++) {
      await seedPhoto({ featured: true, featuredAt: new Date() })
    }
    const extra = await seedPhoto()
    expect(await setFeatured(extra.id, true)).toEqual({
      error: `You can feature up to ${FEATURED_PER_USER} photos.`,
    })
  })

  it('stops a member featuring someone else’s photo, but admins can unfeature it', async () => {
    const row = await seedPhoto({ uploadedBy: OTHER, featured: true, featuredAt: new Date() })
    mockUser(ME)
    expect(await setFeatured(row.id, true)).toEqual({
      error: 'You can only feature your own photos',
    })
    mockUser(ME, { siteManager: true })
    expect(await setFeatured(row.id, false)).toEqual({ ok: true })
  })

  it('featuring an already-featured photo is a no-op', async () => {
    mockUser(ME)
    const row = await seedPhoto({ featured: true, featuredAt: new Date() })
    expect(await setFeatured(row.id, true)).toEqual({ ok: true })
  })

  it('rejects invalid ids and missing photos', async () => {
    mockUser(ME)
    expect(await setFeatured('not-a-uuid', true)).toEqual({ error: 'Invalid photo' })
    expect(await setFeatured('00000000-0000-0000-0000-000000000000', true)).toEqual({
      error: 'Photo not found',
    })
  })
})

describe('validation branches', () => {
  it('updatePhoto rejects bad id, bad fields, missing photo, and no-ops empty changes', async () => {
    mockUser(ME)
    expect(await updatePhoto('not-a-uuid', { caption: 'x' })).toEqual({ error: 'Invalid photo' })
    const row = await seedPhoto()
    expect(await updatePhoto(row.id, { year: 12 })).toEqual({ error: 'Invalid changes' })
    expect(await updatePhoto(row.id, {})).toEqual({ ok: true })
    expect(await updatePhoto('00000000-0000-0000-0000-000000000000', { caption: 'x' })).toEqual({
      error: 'Photo not found',
    })
  })

  it('deletePhoto rejects a bad id', async () => {
    mockUser(ME)
    expect(await deletePhoto('not-a-uuid')).toEqual({ error: 'Invalid photo' })
  })
})

describe('history logging', () => {
  it('records a photo_uploaded event with the new photo id', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(Buffer.from('original'))
    normalizeImage.mockResolvedValue({
      bytes: Buffer.from('processed'),
      width: 800,
      height: 600,
      contentType: 'image/jpeg',
    })
    putGalleryImage.mockResolvedValue({
      url: 'https://blob/gallery/2026/final.jpg',
      pathname: 'gallery/2026/final.jpg',
    })
    backupObject.mockResolvedValue(true)

    await finalizeUpload({
      url: 'https://blob/gallery-tmp/orig.jpg',
      year: 2026,
      filename: 'orig.jpg',
      contentType: 'image/jpeg',
    })

    const [row] = await testDb.select().from(portalPhotos)
    const ev = await latestEvent('photo_uploaded')
    expect(ev.actorUserId).toBe(ME)
    expect(ev.metadata).toMatchObject({ photoId: row.id, year: 2026, filename: 'orig.jpg' })
  })

  it('records photo_caption_edited only when the caption actually changes', async () => {
    mockUser(ME)
    const row = await seedPhoto({ caption: 'before' })

    // Year-only change → no caption event.
    await updatePhoto(row.id, { year: 2024 })
    expect(await latestEvent('photo_caption_edited')).toBeUndefined()

    // Same caption again → still no event.
    await updatePhoto(row.id, { caption: 'before' })
    expect(await latestEvent('photo_caption_edited')).toBeUndefined()

    // Real change → one event with the new caption.
    await updatePhoto(row.id, { caption: 'after' })
    const ev = await latestEvent('photo_caption_edited')
    expect(ev.actorUserId).toBe(ME)
    expect(ev.metadata).toMatchObject({ photoId: row.id, caption: 'after' })
  })

  it('records a photo_deleted event with the removed photo’s details', async () => {
    mockUser(ME)
    const row = await seedPhoto({ year: 2023, filename: 'gone.jpg' })
    await deletePhoto(row.id)
    const ev = await latestEvent('photo_deleted')
    expect(ev.actorUserId).toBe(ME)
    expect(ev.metadata).toMatchObject({ photoId: row.id, year: 2023, filename: 'gone.jpg' })
  })

  it('records photo_featured and photo_unfeatured on toggle', async () => {
    mockUser(ME)
    const row = await seedPhoto()

    await setFeatured(row.id, true)
    expect((await latestEvent('photo_featured')).metadata).toMatchObject({ photoId: row.id })

    await setFeatured(row.id, false)
    expect((await latestEvent('photo_unfeatured')).metadata).toMatchObject({ photoId: row.id })
  })
})

describe('getPhotoHistory', () => {
  it('returns photo events newest-first and ignores non-photo events', async () => {
    // A non-photo event that must be filtered out.
    await testDb.insert(activityLog).values({
      eventType: 'reservation_created',
      actorUserId: null,
      metadata: {},
    })
    await testDb.insert(activityLog).values({
      eventType: 'photo_uploaded',
      actorUserId: ME,
      metadata: { year: 2020 },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    await testDb.insert(activityLog).values({
      eventType: 'photo_deleted',
      actorUserId: ME,
      metadata: { year: 2021 },
      createdAt: new Date('2026-02-01T00:00:00Z'),
    })

    const { events } = await getPhotoHistory()
    expect(events.map((e) => e.eventType)).toEqual(['photo_deleted', 'photo_uploaded'])
    expect(events[0].createdAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('returns no events and an empty name map when there is no photo history', async () => {
    const { events, users } = await getPhotoHistory()
    expect(events).toEqual([])
    expect(users).toEqual({})
  })
})
