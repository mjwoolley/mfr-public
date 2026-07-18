// Daily durability cron (Vercel Cron → GET). Two jobs:
//   1. Reconcile — back up any gallery blob that has no fresh backup row
//      (self-heals a mirror that failed during upload).
//   2. Purge — delete R2 objects whose backup row was marked deleted more than
//      BACKUP_RETENTION_DAYS ago, then drop the row.
// Guarded by CRON_SECRET via the Authorization: Bearer header Vercel sends.

import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { portalDb } from '@/lib/portalDb'
import { portalPhotos, portalBlobBackups } from '@/lib/db/schema'
import { fetchBlobBytes } from '@/lib/photos/blobStore'
import { backupObject, deleteBackupObject } from '@/lib/photos/backupStore'
import { BACKUP_RETENTION_DAYS } from '@/lib/photos/constants'
import { logger } from '@/lib/reservations/logger'

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let backedUp = 0
  let purged = 0

  // 1. Reconcile: photos whose pathname has no backup row yet.
  const [photos, backups] = await Promise.all([
    portalDb
      .select({ pathname: portalPhotos.blobPathname, url: portalPhotos.blobUrl })
      .from(portalPhotos),
    portalDb.select({ pathname: portalBlobBackups.blobPathname }).from(portalBlobBackups),
  ])
  const haveBackup = new Set(backups.map((b) => b.pathname))
  for (const p of photos) {
    if (haveBackup.has(p.pathname)) continue
    try {
      const bytes = await fetchBlobBytes(p.url)
      const ok = await backupObject({ key: p.pathname, bytes, contentType: 'image/jpeg' })
      if (!ok) continue
      await portalDb
        .insert(portalBlobBackups)
        .values({ blobPathname: p.pathname, backupKey: p.pathname, byteSize: bytes.length })
        .onConflictDoNothing()
      backedUp += 1
    } catch (error) {
      logger.error({ error, pathname: p.pathname }, 'cron backup reconcile failed')
    }
  }

  // 2. Purge: backups deleted longer ago than the recovery window.
  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = await portalDb
    .select()
    .from(portalBlobBackups)
    .where(and(isNotNull(portalBlobBackups.deletedAt), lt(portalBlobBackups.deletedAt, cutoff)))
  for (const b of expired) {
    const ok = await deleteBackupObject(b.backupKey)
    if (!ok) continue
    await portalDb
      .delete(portalBlobBackups)
      .where(eq(portalBlobBackups.blobPathname, b.blobPathname))
    purged += 1
  }

  return Response.json({ ok: true, backedUp, purged })
}
