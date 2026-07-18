'use server'

// Member photo-gallery actions (portal_photos). Uploads stream client-direct to
// Blob (a 25 MB photo can't pass through a Server Action body), so finalizeUpload
// takes only the just-uploaded original's URL and normalizes it server-side.
// Every image is copied to an independent R2 backup (best-effort). Gates come
// from lib/authz: any approved member uploads; owner-or-content-admin edits.

import crypto from 'node:crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { canManagePortalContent } from '@mfr/auth'
import { portalDb } from '@/lib/portalDb'
import { portalPhotos, portalBlobBackups } from '@/lib/db/schema'
import { requireApproved } from '@/lib/authz'
import { putGalleryImage, deleteBlobObject, fetchBlobBytes } from '@/lib/photos/blobStore'
import { normalizeImage } from '@/lib/photos/imageProcess'
import { backupObject } from '@/lib/photos/backupStore'
import { getFeaturedCountForUser } from '@/lib/photos/gallery'
import { FEATURED_PER_USER, type ActionResult } from '@/lib/photos/constants'

const yearSchema = z.coerce.number().int().gte(1900).lte(2200)

function revalidateGallery(year?: number) {
  revalidatePath('/')
  revalidatePath('/photos')
  revalidatePath('/photos/people')
  if (year !== undefined) revalidatePath(`/photos/${year}`)
}

/** Delete a blob object, swallowing failures (cleanup is best-effort). */
async function safeDeleteBlob(url: string) {
  try {
    await deleteBlobObject(url)
  } catch {
    // A leftover blob is harmless; the row/backup state is what matters.
  }
}

/** Mirror a stored blob to R2 and record it (best-effort — never throws). */
async function recordBackup(pathname: string, bytes: Buffer, contentType: string) {
  const ok = await backupObject({ key: pathname, bytes, contentType })
  if (!ok) return
  await portalDb
    .insert(portalBlobBackups)
    .values({ blobPathname: pathname, backupKey: pathname, byteSize: bytes.length })
    .onConflictDoUpdate({
      target: portalBlobBackups.blobPathname,
      set: { backupKey: pathname, byteSize: bytes.length, backedUpAt: new Date(), deletedAt: null },
    })
}

const finalizeSchema = z.object({
  url: z.string().url(),
  year: yearSchema,
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
})

/**
 * Turn a client-uploaded original (already in Blob) into a stored gallery photo:
 * normalize (HEIC→JPEG, auto-orient, strip EXIF/GPS, downscale), store the
 * processed image, insert the row, delete the temp original, and back up.
 */
export async function finalizeUpload(input: {
  url: string
  year: number
  filename: string
  contentType: string
}): Promise<ActionResult> {
  const session = await requireApproved()
  const parsed = finalizeSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid upload' }
  const { url, year, filename, contentType } = parsed.data

  let processed
  try {
    const original = await fetchBlobBytes(url)
    processed = await normalizeImage(original, contentType)
  } catch {
    await safeDeleteBlob(url)
    return { error: 'That image could not be processed. Try a different photo.' }
  }

  const finalPath = `gallery/${year}/${crypto.randomUUID()}.jpg`
  const stored = await putGalleryImage(finalPath, processed.bytes, processed.contentType)

  await portalDb.insert(portalPhotos).values({
    year,
    blobUrl: stored.url,
    blobPathname: stored.pathname,
    filename,
    byteSize: processed.bytes.length,
    width: processed.width,
    height: processed.height,
    uploadedBy: session.user.id,
  })

  // The temp original is no longer needed once the processed image is stored.
  await safeDeleteBlob(url)
  await recordBackup(stored.pathname, processed.bytes, processed.contentType)

  revalidateGallery(year)
  return { ok: true }
}

const updateSchema = z.object({
  year: yearSchema.optional(),
  caption: z.string().max(500).optional(),
})

/** Edit a photo's year and/or caption (owner or content-admin). */
export async function updatePhoto(
  id: string,
  fields: { year?: number; caption?: string },
): Promise<ActionResult> {
  const session = await requireApproved()
  if (!z.string().uuid().safeParse(id).success) return { error: 'Invalid photo' }
  const parsed = updateSchema.safeParse(fields)
  if (!parsed.success) return { error: 'Invalid changes' }

  const [row] = await portalDb.select().from(portalPhotos).where(eq(portalPhotos.id, id))
  if (!row) return { error: 'Photo not found' }
  const isAdmin = canManagePortalContent(session.user.roles)
  if (row.uploadedBy !== session.user.id && !isAdmin) return { error: 'Not your photo' }

  const set: Partial<typeof portalPhotos.$inferInsert> = {}
  if (parsed.data.year !== undefined) set.year = parsed.data.year
  if (parsed.data.caption !== undefined) set.caption = parsed.data.caption
  if (Object.keys(set).length === 0) return { ok: true }

  await portalDb.update(portalPhotos).set(set).where(eq(portalPhotos.id, id))
  revalidateGallery(set.year ?? row.year)
  if (set.year !== undefined && set.year !== row.year) revalidatePath(`/photos/${row.year}`)
  return { ok: true }
}

/** Delete a photo (owner or content-admin). Blob is removed now; its backup is
 * retained (deleted_at set) for the recovery window. Idempotent. */
export async function deletePhoto(id: string): Promise<ActionResult> {
  const session = await requireApproved()
  if (!z.string().uuid().safeParse(id).success) return { error: 'Invalid photo' }

  const [row] = await portalDb.select().from(portalPhotos).where(eq(portalPhotos.id, id))
  if (!row) return { ok: true } // idempotent
  const isAdmin = canManagePortalContent(session.user.roles)
  if (row.uploadedBy !== session.user.id && !isAdmin) return { error: 'Not your photo' }

  await safeDeleteBlob(row.blobUrl)
  await portalDb
    .update(portalBlobBackups)
    .set({ deletedAt: new Date() })
    .where(eq(portalBlobBackups.blobPathname, row.blobPathname))
  await portalDb.delete(portalPhotos).where(eq(portalPhotos.id, id))

  revalidateGallery(row.year)
  return { ok: true }
}

/** Feature/unfeature a photo for the home-page album. Members feature only their
 * own (≤ FEATURED_PER_USER); content-admins may unfeature anyone (moderation). */
export async function setFeatured(id: string, featured: boolean): Promise<ActionResult> {
  const session = await requireApproved()
  if (!z.string().uuid().safeParse(id).success) return { error: 'Invalid photo' }

  const [row] = await portalDb.select().from(portalPhotos).where(eq(portalPhotos.id, id))
  if (!row) return { error: 'Photo not found' }
  const isAdmin = canManagePortalContent(session.user.roles)
  const isOwner = row.uploadedBy === session.user.id

  if (featured) {
    if (!isOwner) return { error: 'You can only feature your own photos' }
    if (row.featured) return { ok: true }
    const count = await getFeaturedCountForUser(session.user.id)
    if (count >= FEATURED_PER_USER) {
      return { error: `You can feature up to ${FEATURED_PER_USER} photos.` }
    }
  } else if (!isOwner && !isAdmin) {
    return { error: 'Not your photo' }
  }

  await portalDb
    .update(portalPhotos)
    .set({ featured, featuredAt: featured ? new Date() : null })
    .where(eq(portalPhotos.id, id))
  revalidatePath('/')
  revalidatePath('/photos/people')
  return { ok: true }
}
