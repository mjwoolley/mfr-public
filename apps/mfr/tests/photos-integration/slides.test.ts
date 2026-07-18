// Integration: the photo-slide read helpers against the real test branch.

import { describe, it, expect, afterEach } from 'vitest'
import { inArray } from 'drizzle-orm'
import { testDb } from './testDb'
import { portalPhotoSlides } from '../../lib/db/schema'
import { getSlides, getHighlightSlides, getSlidesByCollection } from '../../lib/photos/slides'

const createdIds: string[] = []

async function seed(collection: string, blobUrl: string, sortOrder: number) {
  const [row] = await testDb
    .insert(portalPhotoSlides)
    .values({
      collection,
      blobUrl,
      blobPathname: `photo-slides/${blobUrl}`,
      sortOrder,
      uploadedBy: 'test-admin',
    })
    .returning()
  createdIds.push(row.id)
  return row
}

afterEach(async () => {
  if (createdIds.length) {
    await testDb.delete(portalPhotoSlides).where(inArray(portalPhotoSlides.id, createdIds))
    createdIds.length = 0
  }
})

describe('photo slide reads', () => {
  it('getSlides returns one collection ordered by sortOrder', async () => {
    await seed('2026', 'b.jpg', 1)
    await seed('2026', 'a.jpg', 0)
    await seed('highlights', 'h.jpg', 0)

    const slides = await getSlides('2026')
    expect(slides.map((s) => s.blobUrl)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('getHighlightSlides returns only the highlights collection', async () => {
    await seed('2026', 'year.jpg', 0)
    await seed('highlights', 'hi.jpg', 0)

    const slides = await getHighlightSlides()
    expect(slides.map((s) => s.blobUrl)).toContain('hi.jpg')
    expect(slides.map((s) => s.blobUrl)).not.toContain('year.jpg')
  })

  it('getSlidesByCollection groups every collection by key', async () => {
    await seed('2025', 'y25.jpg', 0)
    await seed('2026', 'y26.jpg', 0)
    await seed('highlights', 'hi.jpg', 0)

    const byCollection = await getSlidesByCollection()
    expect(byCollection.get('2025')?.map((s) => s.blobUrl)).toEqual(['y25.jpg'])
    expect(byCollection.get('2026')?.map((s) => s.blobUrl)).toEqual(['y26.jpg'])
    expect(byCollection.get('highlights')?.map((s) => s.blobUrl)).toEqual(['hi.jpg'])
  })
})
