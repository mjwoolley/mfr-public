// Requirements coverage (CAP-016 Delete photos, CAP-017 Featured photos):
// delete/feature actions against the real database, re-reading rows and the
// same read helpers the Featured page and home slideshow use.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { portalPhotos, portalBlobBackups, activityLog } from '../../lib/db/schema'
import { ME, OTHER, mockUser, photoValues, seedPhoto } from './requirementsHelpers'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const deleteBlobObject = vi.fn()
vi.mock('../../lib/photos/blobStore', () => ({
  putGalleryImage: vi.fn(),
  deleteBlobObject: (...a: unknown[]) => deleteBlobObject(...a),
  fetchBlobBytes: vi.fn(),
}))
vi.mock('../../lib/photos/backupStore', () => ({
  backupObject: vi.fn(),
  deleteBackupObject: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { deletePhoto, deletePhotos, setFeatured } from '../../app/photos/actions'
import { getAlbumSections, getFeaturedPhotos } from '../../lib/photos/gallery'
import { FEATURED_PER_USER } from '../../lib/photos/constants'

beforeEach(() => {
  deleteBlobObject.mockResolvedValue(undefined)
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  deleteBlobObject.mockReset()
  await testDb.delete(portalPhotos)
  await testDb.delete(portalBlobBackups)
  await testDb.delete(activityLog)
})

async function reread(id: string) {
  const [row] = await testDb.select().from(portalPhotos).where(eq(portalPhotos.id, id))
  return row
}

describe('CAP-016 Delete photos', () => {
  it('CAP-016 · The owner deletes one photo after confirming — gone from the albums, Featured page and home slideshow', async () => {
    mockUser(ME)
    const row = await seedPhoto({ featured: true, featuredAt: new Date() })
    expect((await getFeaturedPhotos()).map((p) => p.id)).toEqual([row.id])

    expect(await deletePhoto(row.id)).toEqual({ ok: true })

    // Featured page and home slideshow both read getFeaturedPhotos.
    expect(await getFeaturedPhotos()).toEqual([])
    const { byYear, byUploader } = await getAlbumSections(ME)
    expect(byYear).toEqual([])
    expect(byUploader).toEqual([])
  })

  it('CAP-016 · I can select several of my photos and delete them together — all 3 disappear', async () => {
    mockUser(ME)
    const rows = await testDb
      .insert(portalPhotos)
      .values([photoValues(), photoValues(), photoValues()])
      .returning()
    expect(await deletePhotos(rows.map((r) => r.id))).toEqual({ ok: true })
    expect(await testDb.select().from(portalPhotos)).toHaveLength(0)
  })

  it(
    'CAP-016 · A bulk delete covers at most 500 photos — 501 is refused and nothing is deleted; 500 are deleted',
    { timeout: 300_000 },
    async () => {
      mockUser(ME, { siteManager: true }) // content admin
      const rows = await testDb
        .insert(portalPhotos)
        .values(Array.from({ length: 501 }, (_, i) => photoValues({ filename: `p${i}.jpg` })))
        .returning({ id: portalPhotos.id })
      const ids = rows.map((r) => r.id)
      expect(ids).toHaveLength(501)

      // 501 → "Invalid selection", nothing deleted.
      expect(await deletePhotos(ids)).toEqual({ error: 'Invalid selection' })
      expect(await testDb.select({ id: portalPhotos.id }).from(portalPhotos)).toHaveLength(501)
      expect(deleteBlobObject).not.toHaveBeenCalled()

      // 500 → they are deleted.
      expect(await deletePhotos(ids.slice(0, 500))).toEqual({ ok: true })
      const left = await testDb.select({ id: portalPhotos.id }).from(portalPhotos)
      expect(left.map((r) => r.id)).toEqual([ids[500]])
    },
  )
})

describe('CAP-017 Featured photos', () => {
  it('CAP-017 · I feature one of my own photos — it appears on the Featured page and in the home slideshow', async () => {
    mockUser(ME)
    const row = await seedPhoto()
    expect(await getFeaturedPhotos()).toEqual([])
    expect(await setFeatured(row.id, true)).toEqual({ ok: true })
    expect((await getFeaturedPhotos()).map((p) => p.id)).toEqual([row.id])
  })

  it('CAP-017 · Each member may feature up to 5 of their own photos — with 4 featured, another becomes featured', async () => {
    mockUser(ME)
    for (let i = 0; i < FEATURED_PER_USER - 1; i++) {
      await seedPhoto({ featured: true, featuredAt: new Date() })
    }
    // Another member's featured photos don't count toward my limit.
    await seedPhoto({ uploadedBy: OTHER, featured: true, featuredAt: new Date() })
    const fifth = await seedPhoto()

    expect(FEATURED_PER_USER).toBe(5)
    expect(await setFeatured(fifth.id, true)).toEqual({ ok: true })
    expect((await reread(fifth.id)).featured).toBe(true)
  })

  it('CAP-017 · Each member may feature up to 5 of their own photos — with 5 featured, it stays unfeatured', async () => {
    mockUser(ME)
    for (let i = 0; i < FEATURED_PER_USER; i++) {
      await seedPhoto({ featured: true, featuredAt: new Date() })
    }
    const sixth = await seedPhoto()
    expect(await setFeatured(sixth.id, true)).toEqual({
      error: 'You can feature up to 5 photos.',
    })
    const after = await reread(sixth.id)
    expect(after.featured).toBe(false)
    expect(after.featuredAt).toBeNull()
  })

  it('CAP-017 · I cannot feature someone else’s photo by going around the screens', async () => {
    mockUser(ME)
    const theirs = await seedPhoto({ uploadedBy: OTHER })
    expect(await setFeatured(theirs.id, true)).toEqual({
      error: 'You can only feature your own photos',
    })
    expect((await reread(theirs.id)).featured).toBe(false)
    expect(await getFeaturedPhotos()).toEqual([])
  })

  it('CAP-017 · A content admin can unfeature anyone’s photo but not feature it', async () => {
    mockUser(ME, { siteOwner: true })
    const plain = await seedPhoto({ uploadedBy: OTHER })
    const starred = await seedPhoto({ uploadedBy: OTHER, featured: true, featuredAt: new Date() })

    expect(await setFeatured(plain.id, true)).toEqual({
      error: 'You can only feature your own photos',
    })
    expect((await reread(plain.id)).featured).toBe(false)

    expect(await setFeatured(starred.id, false)).toEqual({ ok: true })
    expect((await reread(starred.id)).featured).toBe(false)
    expect(await getFeaturedPhotos()).toEqual([])
  })
})
