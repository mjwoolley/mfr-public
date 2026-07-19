// Read helpers for the member photo gallery (portal_photos). The site's own
// Postgres is the gallery's "read API". Uploader display names come from the
// identity users table, joined in JS by id string (the portal→identity link is
// logical/by-value, like getAttendees in lib/portal.ts).

import { and, desc, eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { portalDb } from '@/lib/portalDb'
import { identityDb } from '@/lib/identityDb'
import { portalPhotos } from '@/lib/db/schema'

export interface GalleryPhoto {
  id: string
  year: number
  blobUrl: string
  filename: string
  byteSize: number
  width: number
  height: number
  caption: string | null
  featured: boolean
  uploadedBy: string
  createdAt: Date
}

/** A run of photos under an optional sub-heading (a year, in the by-uploader view). */
export interface PhotoBlock {
  label?: string
  photos: GalleryPhoto[]
}

/** A titled group in the Albums grid — a year (By Year) or an uploader (By Uploader). */
export interface PhotoSection {
  id: string
  title?: string
  subtitle?: string
  blocks: PhotoBlock[]
}

function toView(r: typeof portalPhotos.$inferSelect): GalleryPhoto {
  return {
    id: r.id,
    year: r.year,
    blobUrl: r.blobUrl,
    filename: r.filename,
    byteSize: r.byteSize,
    width: r.width,
    height: r.height,
    caption: r.caption,
    featured: r.featured,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt,
  }
}

/** Featured photos for the home-page album, most-recently-featured first. */
export async function getFeaturedPhotos(): Promise<GalleryPhoto[]> {
  const rows = await portalDb
    .select()
    .from(portalPhotos)
    .where(eq(portalPhotos.featured, true))
    .orderBy(desc(portalPhotos.featuredAt))
  return rows.map(toView)
}

/** How many photos a member currently has featured (enforces the per-user cap). */
export async function getFeaturedCountForUser(userId: string): Promise<number> {
  const rows = await portalDb
    .select({ id: portalPhotos.id })
    .from(portalPhotos)
    .where(and(eq(portalPhotos.uploadedBy, userId), eq(portalPhotos.featured, true)))
  return rows.length
}

/** Group a photo list into year blocks (year desc; photos keep their input order). */
function toYearBlocks(photos: GalleryPhoto[]): PhotoBlock[] {
  const byYear = new Map<number, GalleryPhoto[]>()
  for (const p of photos) {
    const arr = byYear.get(p.year)
    if (arr) arr.push(p)
    else byYear.set(p.year, [p])
  }
  return [...byYear.keys()]
    .sort((a, b) => b - a)
    .map((year) => ({ label: String(year), photos: byYear.get(year)! }))
}

/**
 * The two Albums groupings from one photo read: **By Year** (a section per year,
 * newest first) and **By Uploader** (a section per contributor — alphabetical,
 * names from identity — with each person's photos broken up by year). Both share
 * the same underlying photos (createdAt-desc within each block).
 */
export async function getAlbumSections(
  currentUserId: string,
): Promise<{ byYear: PhotoSection[]; byUploader: PhotoSection[] }> {
  const rows = await portalDb.select().from(portalPhotos).orderBy(desc(portalPhotos.createdAt))
  const photos = rows.map(toView)

  // By Year — one section per year (the year is the section title, no sub-breaks).
  const byYear: PhotoSection[] = toYearBlocks(photos).map((b) => ({
    id: `y${b.label}`,
    title: b.label,
    blocks: [{ photos: b.photos }],
  }))

  if (photos.length === 0) return { byYear, byUploader: [] }

  // By Uploader — resolve display names from identity, group per uploader, then
  // break each uploader's photos into year sub-blocks.
  const names = new Map<string, string>()
  const idRows = await identityDb
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
  for (const u of idRows) names.set(u.id, (u.name ?? u.email.split('@')[0]).trim())

  const byUser = new Map<string, GalleryPhoto[]>()
  for (const p of photos) {
    const arr = byUser.get(p.uploadedBy)
    if (arr) arr.push(p)
    else byUser.set(p.uploadedBy, [p])
  }

  const uploaders = [...byUser.entries()]
    .map(([userId, ups]) => ({ userId, name: names.get(userId) ?? 'Unknown', photos: ups }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const byUploader: PhotoSection[] = uploaders.map(({ userId, name, photos: ups }) => ({
    id: userId,
    title: userId === currentUserId ? `${name} (you)` : name,
    subtitle: `${ups.length} photo${ups.length === 1 ? '' : 's'}`,
    blocks: toYearBlocks(ups),
  }))

  return { byYear, byUploader }
}
