// Requirements coverage (CAP-014 Add photos, CAP-019 Photo backup): uploads
// through finalizeUpload with REAL image processing (sharp + exifr) and a real
// database. Only Blob storage, the R2 backup and auth are mocked — the stored
// bytes are captured from the putGalleryImage mock and inspected.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import sharp from 'sharp'
import exifr from 'exifr'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { portalPhotos, portalBlobBackups, activityLog } from '../../lib/db/schema'
import { ME, mockUser } from './requirementsHelpers'

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

const backupObject = vi.fn()
vi.mock('../../lib/photos/backupStore', () => ({
  backupObject: (...a: unknown[]) => backupObject(...a),
  deleteBackupObject: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { finalizeUpload, updatePhoto } from '../../app/photos/actions'

const TMP_URL = 'https://blob/gallery-tmp/orig.jpg'

beforeEach(() => {
  deleteBlobObject.mockResolvedValue(undefined)
  putGalleryImage.mockImplementation(async (path: string) => ({
    url: `https://blob/${path}`,
    pathname: path,
  }))
  backupObject.mockResolvedValue(true)
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const m of [putGalleryImage, deleteBlobObject, fetchBlobBytes, backupObject]) m.mockReset()
  await testDb.delete(portalPhotos)
  await testDb.delete(portalBlobBackups)
  await testDb.delete(activityLog)
})

/** A screenshot-like PNG: no EXIF, so no capture date. */
function screenshot() {
  return sharp({ create: { width: 60, height: 40, channels: 3, background: '#336699' } })
    .png()
    .toBuffer()
}

/** A phone JPEG carrying a GPS position and sideways EXIF orientation. */
function phoneJpeg() {
  return sharp({ create: { width: 60, height: 40, channels: 3, background: '#993366' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '35/1 25/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '82/1 12/1 0/1',
      },
    })
    .toBuffer()
}

function finalize(filename: string, contentType: string, year = 2026) {
  return finalizeUpload({ url: TMP_URL, year, filename, contentType })
}

describe('CAP-014 Add photos — finalizeUpload with real processing', () => {
  it('CAP-014 · A photo with no taken date is filed under the current reunion year', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(await screenshot())

    // The uploader passes the admin-set reunion year (2026) as the fallback.
    expect(await finalize('screenshot.png', 'image/png', 2026)).toEqual({ ok: true })

    const [row] = await testDb.select().from(portalPhotos)
    expect(row.year).toBe(2026)
    expect(row.blobPathname).toMatch(/^gallery\/2026\//)

    // …and I can change its year afterwards.
    expect(await updatePhoto(row.id, { year: 2024 })).toEqual({ ok: true })
    const [after] = await testDb.select().from(portalPhotos).where(eq(portalPhotos.id, row.id))
    expect(after.year).toBe(2024)
  })

  it('CAP-014 · Location data is removed from every photo I add — the stored copy has no GPS and is upright', async () => {
    mockUser(ME)
    const original = await phoneJpeg()
    expect(await exifr.gps(original)).toBeTruthy()
    fetchBlobBytes.mockResolvedValue(original)

    expect(await finalize('IMG_0001.jpg', 'image/jpeg')).toEqual({ ok: true })

    const stored = putGalleryImage.mock.calls[0][1] as Buffer
    expect(await exifr.gps(stored)).toBeUndefined()
    expect((await sharp(stored).metadata()).exif).toBeUndefined()
    const [row] = await testDb.select().from(portalPhotos)
    // 60×40 stored sideways → shown upright as 40×60.
    expect([row.width, row.height]).toEqual([40, 60])
  })

  it('CAP-014 · An unreadable image is refused', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(Buffer.from('definitely not an image'))

    expect(await finalize('notes.jpg', 'image/jpeg')).toEqual({
      error: 'That image could not be processed. Try a different photo.',
    })
    expect(putGalleryImage).not.toHaveBeenCalled()
    expect(await testDb.select().from(portalPhotos)).toHaveLength(0)
  })
})

describe('CAP-019 Photo backup — a failed backup never fails the upload', () => {
  it('CAP-019 · A failed backup never fails the member’s upload — backup store refuses', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(await screenshot())
    backupObject.mockResolvedValue(false) // store unavailable (wrapper reports failure)

    expect(await finalize('a.png', 'image/png')).toEqual({ ok: true })
    expect(backupObject).toHaveBeenCalledTimes(1)
    expect(await testDb.select().from(portalPhotos)).toHaveLength(1)
    // No backup recorded, so the daily check will catch it up.
    expect(await testDb.select().from(portalBlobBackups)).toHaveLength(0)
  })

  it('CAP-019 · A failed backup never fails the member’s upload — backup call throws', async () => {
    mockUser(ME)
    fetchBlobBytes.mockResolvedValue(await screenshot())
    backupObject.mockRejectedValue(new Error('R2 unreachable'))

    expect(await finalize('b.png', 'image/png')).toEqual({ ok: true })
    expect(await testDb.select().from(portalPhotos)).toHaveLength(1)
    expect(await testDb.select().from(portalBlobBackups)).toHaveLength(0)
    // The rest of the upload still completed: temp original removed, history kept.
    expect(deleteBlobObject).toHaveBeenCalledWith(TMP_URL)
    const events = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.eventType, 'photo_uploaded'))
    expect(events).toHaveLength(1)
  })
})
