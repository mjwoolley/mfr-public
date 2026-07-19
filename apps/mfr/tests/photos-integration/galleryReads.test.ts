// Integration: the gallery read helpers against the real test branch.

import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './testDb'
import { portalPhotos } from '../../lib/db/schema'
import {
  getFeaturedPhotos,
  getFeaturedCountForUser,
  getAlbumSections,
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
  it('getFeaturedPhotos returns only featured, most-recent first', async () => {
    await seed({ filename: 'plain.jpg' })
    await seed({ filename: 'f1.jpg', featured: true, featuredAt: new Date('2026-01-01') })
    await seed({ filename: 'f2.jpg', featured: true, featuredAt: new Date('2026-02-01') })
    const rows = await getFeaturedPhotos()
    expect(rows.map((r) => r.filename)).toEqual(['f2.jpg', 'f1.jpg'])
  })

  it('getFeaturedCountForUser scopes to one uploader', async () => {
    await seed({ uploadedBy: 'user-a', featured: true, featuredAt: new Date() })
    await seed({ uploadedBy: 'user-a' })
    await seed({ uploadedBy: 'user-b', featured: true, featuredAt: new Date() })
    expect(await getFeaturedCountForUser('user-a')).toBe(1)
    expect(await getFeaturedCountForUser('user-b')).toBe(1)
  })

  it('getAlbumSections groups By Year (newest first) with the right counts', async () => {
    await seed({ year: 2025, filename: 'old.jpg', createdAt: new Date('2025-01-01') })
    await seed({ year: 2025, filename: 'new.jpg', createdAt: new Date('2025-06-01') })
    await seed({ year: 2024, filename: 'other.jpg' })

    const { byYear } = await getAlbumSections('user-a')
    expect(byYear.map((s) => s.title)).toEqual(['2025', '2024'])
    // Newest year has both photos, newest-first within the year.
    expect(byYear[0].blocks[0].photos.map((p) => p.filename)).toEqual(['new.jpg', 'old.jpg'])
    expect(byYear[1].blocks[0].photos).toHaveLength(1)
  })

  it('getAlbumSections groups By Uploader with per-year sub-blocks and a "(you)" marker', async () => {
    await seed({ uploadedBy: 'user-a', year: 2026 })
    await seed({ uploadedBy: 'user-a', year: 2025 })
    await seed({ uploadedBy: 'user-b', year: 2026 })

    const { byUploader } = await getAlbumSections('user-a')
    const a = byUploader.find((s) => s.id === 'user-a')!
    const b = byUploader.find((s) => s.id === 'user-b')!
    // user-a's photos break into two year sub-blocks, newest year first.
    expect(a.blocks.map((bl) => bl.label)).toEqual(['2026', '2025'])
    expect(a.subtitle).toBe('2 photos')
    expect(a.title).toMatch(/\(you\)$/)
    // user-b has one year block, one photo.
    expect(b.blocks).toHaveLength(1)
    expect(b.subtitle).toBe('1 photo')
  })

  it('getAlbumSections returns empty groupings with no photos', async () => {
    const { byYear, byUploader } = await getAlbumSections('user-a')
    expect(byYear).toEqual([])
    expect(byUploader).toEqual([])
  })
})
