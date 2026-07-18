// Read helpers for admin-curated photo slides (portal_photo_slides). These feed
// the rotating slideshows on the home hero (the "highlights" collection) and
// the /photos album cards (one collection per reunion year). Google Photos
// albums remain the canonical archive — slides are additive preview content.

import { asc, eq } from 'drizzle-orm'
import { portalDb } from '@/lib/portalDb'
import { portalPhotoSlides } from '@/lib/db/schema'

export const HIGHLIGHTS = 'highlights'

export interface Slide {
  id: string
  blobUrl: string
}

/** Slides for one collection ("highlights" or a 4-digit year), display order. */
export async function getSlides(collection: string): Promise<Slide[]> {
  const rows = await portalDb
    .select({ id: portalPhotoSlides.id, blobUrl: portalPhotoSlides.blobUrl })
    .from(portalPhotoSlides)
    .where(eq(portalPhotoSlides.collection, collection))
    .orderBy(asc(portalPhotoSlides.sortOrder), asc(portalPhotoSlides.createdAt))
  return rows
}

/** The home hero set. */
export function getHighlightSlides(): Promise<Slide[]> {
  return getSlides(HIGHLIGHTS)
}

/**
 * Every collection's slides in display order, keyed by collection string. Used
 * by /photos (keyed by String(year)) and the admin editor (all collections).
 */
export async function getSlidesByCollection(): Promise<Map<string, Slide[]>> {
  const rows = await portalDb
    .select({
      id: portalPhotoSlides.id,
      blobUrl: portalPhotoSlides.blobUrl,
      collection: portalPhotoSlides.collection,
    })
    .from(portalPhotoSlides)
    .orderBy(asc(portalPhotoSlides.sortOrder), asc(portalPhotoSlides.createdAt))
  const byCollection = new Map<string, Slide[]>()
  for (const r of rows) {
    const list = byCollection.get(r.collection) ?? []
    list.push({ id: r.id, blobUrl: r.blobUrl })
    byCollection.set(r.collection, list)
  }
  return byCollection
}
