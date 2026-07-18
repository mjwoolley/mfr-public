// Integration: the gallery read helpers against the real test branch.

import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './testDb'
import { portalPhotos } from '../../lib/db/schema'
import {
  getPhotosByYear,
  getGalleryYears,
  getFeaturedPhotos,
  getUserPhotos,
  getFeaturedCountForUser,
  getYearSummaries,
  getContributors,
} from '../../lib/photos/gallery'

async function seed(over: Partial<typeof portalPhotos.$inferInsert>) {
  await testDb.insert(portalPhotos).values({
    year: 2026,
    blobUrl: 'https://blob/x.jpg',
    blobPathname: `gallery/${crypto.randomUUID()}.jpg`,
    filename: 'x.jpg',
    byteSize: 1000,
    width: 800,
    height: 600,
    uploadedBy: 'user-a',
    ...over,
  })
}

afterEach(async () => {
  await testDb.delete(portalPhotos)
})

describe('gallery reads', () => {
  it('getPhotosByYear returns a year newest-first', async () => {
    await seed({ year: 2025, filename: 'old.jpg', createdAt: new Date('2025-01-01') })
    await seed({ year: 2025, filename: 'new.jpg', createdAt: new Date('2025-06-01') })
    await seed({ year: 2024, filename: 'other.jpg' })
    const rows = await getPhotosByYear(2025)
    expect(rows.map((r) => r.filename)).toEqual(['new.jpg', 'old.jpg'])
  })

  it('getGalleryYears returns distinct years, newest first', async () => {
    await seed({ year: 2024 })
    await seed({ year: 2026 })
    await seed({ year: 2026 })
    expect(await getGalleryYears()).toEqual([2026, 2024])
  })

  it('getFeaturedPhotos returns only featured, most-recent first', async () => {
    await seed({ filename: 'plain.jpg' })
    await seed({ filename: 'f1.jpg', featured: true, featuredAt: new Date('2026-01-01') })
    await seed({ filename: 'f2.jpg', featured: true, featuredAt: new Date('2026-02-01') })
    const rows = await getFeaturedPhotos()
    expect(rows.map((r) => r.filename)).toEqual(['f2.jpg', 'f1.jpg'])
  })

  it('getUserPhotos / getFeaturedCountForUser scope to one uploader', async () => {
    await seed({ uploadedBy: 'user-a', featured: true, featuredAt: new Date() })
    await seed({ uploadedBy: 'user-a' })
    await seed({ uploadedBy: 'user-b', featured: true, featuredAt: new Date() })
    expect((await getUserPhotos('user-a')).length).toBe(2)
    expect(await getFeaturedCountForUser('user-a')).toBe(1)
    expect(await getFeaturedCountForUser('user-b')).toBe(1)
  })

  it('getYearSummaries gives a cover + count per year', async () => {
    await seed({ year: 2026, blobUrl: 'https://blob/cover.jpg', createdAt: new Date('2026-03-01') })
    await seed({ year: 2026, createdAt: new Date('2026-01-01') })
    const map = await getYearSummaries()
    expect(map.get(2026)?.count).toBe(2)
    expect(map.get(2026)?.coverUrl).toBe('https://blob/cover.jpg')
  })

  it('getContributors groups photos by uploader', async () => {
    await seed({ uploadedBy: 'user-a' })
    await seed({ uploadedBy: 'user-b' })
    await seed({ uploadedBy: 'user-b' })
    const groups = await getContributors()
    const byId = new Map(groups.map((g) => [g.id, g.photos.length]))
    expect(byId.get('user-a')).toBe(1)
    expect(byId.get('user-b')).toBe(2)
  })
})
