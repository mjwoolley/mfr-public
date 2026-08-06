// Recover gallery uploads whose originals reached Blob but never became photos.
//
// An upload is two steps: the browser streams the original to `gallery-tmp/`,
// then finalizeUpload normalizes it, stores the processed image and inserts the
// portal_photos row. Step two deletes the temp original as soon as it succeeds,
// so ANYTHING still under `gallery-tmp/` is by definition an upload that never
// landed. Between 2026-07-22 and the sharp 0.34.5 revert, step two threw for
// every member (sharp's WASM fallback returned SharedArrayBuffer-backed bytes,
// which `fetch` rejects), leaving a batch of orphans behind.
//
// Run with tsx, from the repo root:
//
//   # 1. See what is there (safe, read-only — this is the default)
//   npx tsx apps/mfr/scripts/recover-orphaned-uploads.ts
//
//   # 2. Recover one member's batch
//   npx tsx apps/mfr/scripts/recover-orphaned-uploads.ts \
//     --user <uuid> --year 2026 --after 2026-07-31 --before 2026-08-06 --commit
//
// Needs BLOB_READ_WRITE_TOKEN and DATABASE_URL for the target environment.
//
// ATTRIBUTION IS MANUAL, ON PURPOSE. The temp blob records only a filename and
// an upload time — not who uploaded it — and more than one member hit this bug.
// The dry run prints upload times so batches can be told apart; --user is then
// asserted by the operator, never guessed. Recover one member at a time.

import { list } from '@vercel/blob'
import { portalDb } from '../lib/portalDb'
import { portalPhotos } from '../lib/db/schema'
import { fetchBlobBytes, putGalleryImage, deleteBlobObject } from '../lib/photos/blobStore'
import { normalizeImage } from '../lib/photos/imageProcess'
import { logPhotoActivity } from '../lib/photos/logPhotoActivity'

const PREFIX = 'gallery-tmp/'
/** Ignore very recent objects — an upload could still be mid-flight. */
const MIN_AGE_MS = 60 * 60 * 1000

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

/** `gallery-tmp/IMG_1234-Ab12Cd.heic` → `IMG_1234.heic` (drop Blob's suffix). */
function originalName(pathname: string): string {
  const base = pathname.slice(PREFIX.length)
  const dot = base.lastIndexOf('.')
  if (dot === -1) return base
  return `${base.slice(0, dot).replace(/-[A-Za-z0-9]{8,}$/, '')}${base.slice(dot)}`
}

function contentTypeFor(name: string): string {
  return EXT_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

async function listOrphans() {
  const out: { url: string; pathname: string; size: number; uploadedAt: Date }[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 })
    out.push(...page.blobs.map((b) => ({ ...b, uploadedAt: new Date(b.uploadedAt) })))
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return out.sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())
}

async function main() {
  const commit = process.argv.includes('--commit')
  const user = arg('user')
  const year = arg('year') ? Number(arg('year')) : undefined
  const after = arg('after') ? new Date(arg('after')!) : undefined
  const before = arg('before') ? new Date(arg('before')!) : undefined
  const cutoff = Date.now() - MIN_AGE_MS

  let orphans = (await listOrphans()).filter((b) => b.uploadedAt.getTime() < cutoff)
  if (after) orphans = orphans.filter((b) => b.uploadedAt >= after)
  if (before) orphans = orphans.filter((b) => b.uploadedAt <= before)

  if (orphans.length === 0) {
    console.log('No orphaned uploads under gallery-tmp/ — nothing to recover.')
    return
  }

  console.log(`${orphans.length} orphaned upload(s) under ${PREFIX}:\n`)
  for (const b of orphans) {
    const mb = (b.size / 1024 / 1024).toFixed(2)
    console.log(
      `  ${b.uploadedAt.toISOString()}  ${mb.padStart(7)} MB  ${originalName(b.pathname)}`,
    )
  }
  console.log()

  if (!commit) {
    console.log('Dry run — nothing was changed.')
    console.log('Re-run with --user <uuid> --year <n> --commit to recover these as that member.')
    console.log("Narrow to one member's batch with --after / --before before committing.")
    return
  }

  if (!user || !year || Number.isNaN(year)) {
    console.error('--commit requires --user <uuid> and --year <n> (who uploaded these, and when')
    console.error('to file them if the photo carries no EXIF capture date).')
    process.exitCode = 1
    return
  }

  let recovered = 0
  const failed: string[] = []

  for (const blob of orphans) {
    const filename = originalName(blob.pathname)
    try {
      const original = await fetchBlobBytes(blob.url)
      const processed = await normalizeImage(original, contentTypeFor(filename))

      // Same rule as finalizeUpload: file under the capture year when the
      // original carries a sane one, else the year the operator supplied.
      const captured = processed.takenAt?.getFullYear()
      const finalYear = captured && captured >= 1900 && captured <= 2200 ? captured : year

      const stored = await putGalleryImage(
        `gallery/${finalYear}/${crypto.randomUUID()}.jpg`,
        processed.bytes,
        processed.contentType,
      )
      const [inserted] = await portalDb
        .insert(portalPhotos)
        .values({
          year: finalYear,
          blobUrl: stored.url,
          blobPathname: stored.pathname,
          filename,
          byteSize: processed.bytes.length,
          width: processed.width,
          height: processed.height,
          uploadedBy: user,
        })
        .returning({ id: portalPhotos.id })

      await logPhotoActivity({
        eventType: 'photo_uploaded',
        actorUserId: user,
        metadata: { photoId: inserted?.id, year: finalYear, filename, recovered: true },
      })

      // Only now is the original expendable — the photo is on the site.
      await deleteBlobObject(blob.url)
      recovered += 1
      console.log(`  recovered  ${filename}  → ${finalYear}`)
    } catch (err) {
      failed.push(filename)
      console.error(`  FAILED     ${filename}: ${(err as Error).message}`)
    }
  }

  console.log(`\nRecovered ${recovered}/${orphans.length}.`)
  if (failed.length > 0) {
    console.log(`Left in place (still recoverable): ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
