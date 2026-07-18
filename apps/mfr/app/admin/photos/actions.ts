'use server'

// Content-admin server actions for photo slides (portal_photo_slides): upload,
// remove, and reorder the curated rotation images per collection. Gated by
// requirePortalContentAdmin (site owner or manager) — the same gate as album
// links. Blob I/O goes through lib/photos/blobStore (mocked in tests).

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { portalDb } from '@/lib/portalDb'
import { portalPhotoSlides } from '@/lib/db/schema'
import { requirePortalContentAdmin } from '@/lib/authz'
import { putSlideImage, deleteSlideImage } from '@/lib/photos/blobStore'

export type ActionResult = { ok: true } | { error: string }

/** Max slides per collection — keeps rotations sane. */
export const SLIDE_CAP = 12

const collectionSchema = z.string().regex(/^(highlights|\d{4})$/)

function revalidatePhotos() {
  revalidatePath('/')
  revalidatePath('/photos')
  revalidatePath('/admin')
}

export async function uploadSlides(collection: string, files: File[]): Promise<ActionResult> {
  const session = await requirePortalContentAdmin()
  const parsed = collectionSchema.safeParse(collection)
  if (!parsed.success) return { error: 'Invalid collection' }
  if (!files.length) return { error: 'No files selected' }
  if (files.some((f) => !f.type.startsWith('image/'))) {
    return { error: 'Only image files can be uploaded.' }
  }

  const existing = await portalDb
    .select({ sortOrder: portalPhotoSlides.sortOrder })
    .from(portalPhotoSlides)
    .where(eq(portalPhotoSlides.collection, parsed.data))
  if (existing.length + files.length > SLIDE_CAP) {
    return { error: `Each collection holds up to ${SLIDE_CAP} photos.` }
  }
  let nextOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1

  for (const file of files) {
    const { url, pathname } = await putSlideImage(file)
    await portalDb.insert(portalPhotoSlides).values({
      collection: parsed.data,
      blobUrl: url,
      blobPathname: pathname,
      sortOrder: nextOrder++,
      uploadedBy: session.user.id,
    })
  }
  revalidatePhotos()
  return { ok: true }
}

export async function removeSlide(id: string): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { error: 'Invalid slide' }
  const [row] = await portalDb
    .select()
    .from(portalPhotoSlides)
    .where(eq(portalPhotoSlides.id, parsed.data))
  if (!row) return { ok: true } // idempotent
  await deleteSlideImage(row.blobUrl)
  await portalDb.delete(portalPhotoSlides).where(eq(portalPhotoSlides.id, parsed.data))
  revalidatePhotos()
  return { ok: true }
}

export async function reorderSlides(
  collection: string,
  orderedIds: string[],
): Promise<ActionResult> {
  await requirePortalContentAdmin()
  if (!collectionSchema.safeParse(collection).success) return { error: 'Invalid collection' }
  const ids = z.array(z.string().uuid()).safeParse(orderedIds)
  if (!ids.success) return { error: 'Invalid order' }
  await portalDb.transaction(async (tx) => {
    for (let i = 0; i < ids.data.length; i++) {
      await tx
        .update(portalPhotoSlides)
        .set({ sortOrder: i })
        .where(eq(portalPhotoSlides.id, ids.data[i]))
    }
  })
  revalidatePhotos()
  return { ok: true }
}
