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

export interface Contributor {
  id: string
  name: string
  photos: GalleryPhoto[]
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

/** One reunion year's photos, newest first. */
export async function getPhotosByYear(year: number): Promise<GalleryPhoto[]> {
  const rows = await portalDb
    .select()
    .from(portalPhotos)
    .where(eq(portalPhotos.year, year))
    .orderBy(desc(portalPhotos.createdAt))
  return rows.map(toView)
}

/** Distinct years that actually have photos, newest first (browse nav). */
export async function getGalleryYears(): Promise<number[]> {
  const rows = await portalDb
    .selectDistinct({ year: portalPhotos.year })
    .from(portalPhotos)
    .orderBy(desc(portalPhotos.year))
  return rows.map((r) => r.year)
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

/** One member's uploads, newest first. */
export async function getUserPhotos(userId: string): Promise<GalleryPhoto[]> {
  const rows = await portalDb
    .select()
    .from(portalPhotos)
    .where(eq(portalPhotos.uploadedBy, userId))
    .orderBy(desc(portalPhotos.createdAt))
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

/** Per-year cover + count from member photos, for the /photos year cards. */
export async function getYearSummaries(): Promise<
  Map<number, { coverUrl: string; count: number }>
> {
  const rows = await portalDb.select().from(portalPhotos).orderBy(desc(portalPhotos.createdAt))
  const byYear = new Map<number, { coverUrl: string; count: number }>()
  for (const r of rows) {
    const cur = byYear.get(r.year)
    if (cur) cur.count += 1
    else byYear.set(r.year, { coverUrl: r.blobUrl, count: 1 })
  }
  return byYear
}

/** All photos grouped by contributor (name from identity), for the by-user view. */
export async function getContributors(): Promise<Contributor[]> {
  const rows = await portalDb.select().from(portalPhotos).orderBy(desc(portalPhotos.createdAt))
  if (rows.length === 0) return []

  const names = new Map<string, string>()
  const idRows = await identityDb
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
  for (const u of idRows) names.set(u.id, (u.name ?? u.email.split('@')[0]).trim())

  const byUser = new Map<string, Contributor>()
  for (const r of rows) {
    let group = byUser.get(r.uploadedBy)
    if (!group) {
      group = { id: r.uploadedBy, name: names.get(r.uploadedBy) ?? 'Unknown', photos: [] }
      byUser.set(r.uploadedBy, group)
    }
    group.photos.push(toView(r))
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))
}
