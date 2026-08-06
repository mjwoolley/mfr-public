// Server-side image normalization for gallery uploads. Kept as its own module
// (mocked in tests) so the upload action never touches sharp/heic-convert/exifr
// directly. Every stored image ends up as an auto-oriented, metadata-stripped
// JPEG no larger than MAX_DIMENSION on its long edge:
//   - The capture date (EXIF DateTimeOriginal) is read from the ORIGINAL bytes
//     first — for HEIC that must happen before heic-convert, which drops EXIF —
//     so the upload can file the photo under the year it was actually taken.
//   - HEIC/HEIF (iPhone default) is decoded to JPEG next via heic-convert
//     (pure-JS libheif — avoids native HEIF build issues on Vercel).
//   - sharp then auto-orients from EXIF and re-encodes; sharp drops all metadata
//     by default, so EXIF/GPS location is stripped from the stored image.

import sharp from 'sharp'
import convert from 'heic-convert'
import exifr from 'exifr'
import { logger } from '@/lib/reservations/logger'
import { MAX_DIMENSION } from './constants'

export interface ProcessedImage {
  bytes: Buffer
  width: number
  height: number
  contentType: string
  /** When the photo was taken (EXIF), if the original carried a valid date. */
  takenAt?: Date
}

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

/**
 * Best-effort read of the original's capture date (EXIF DateTimeOriginal, then
 * CreateDate) from the raw bytes — works for JPEG and HEIC alike (exifr parses
 * HEIC metadata without decoding the image). Returns undefined for any photo
 * without a usable date (screenshots, scans, stripped downloads) or on any
 * parse error — the caller falls back to a provided year.
 */
export async function readCaptureDate(input: Buffer): Promise<Date | undefined> {
  try {
    const meta = await exifr.parse(input, ['DateTimeOriginal', 'CreateDate'])
    const raw = meta?.DateTimeOriginal ?? meta?.CreateDate
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw
  } catch {
    // No/unsupported metadata — fall through to undefined.
  }
  return undefined
}

export async function normalizeImage(input: Buffer, contentType: string): Promise<ProcessedImage> {
  const takenAt = await readCaptureDate(input)

  let working = input
  if (HEIC_TYPES.has(contentType.toLowerCase())) {
    const jpeg = await convert({ buffer: working, format: 'JPEG', quality: 0.9 })
    working = Buffer.from(jpeg)
  }

  const { data, info } = await sharp(working, { failOn: 'none' })
    .rotate() // apply EXIF orientation before metadata is dropped
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  return {
    bytes: unshare(data),
    width: info.width,
    height: info.height,
    contentType: 'image/jpeg',
    takenAt,
  }
}

/**
 * Return bytes that are safe to hand to `fetch` (i.e. to the Blob upload).
 *
 * sharp normally runs its native binary, whose Buffers are ordinary heap
 * memory. When the native binary can't be loaded it silently falls back to
 * `@img/sharp-wasm32`, which allocates a *shared* WebAssembly memory — so its
 * Buffers are backed by a SharedArrayBuffer, and `fetch` rejects those outright
 * ("ArrayBuffer: SharedArrayBuffer is not allowed"). That broke every upload in
 * production for two weeks under sharp 0.35.3 and, because the throw happened
 * after normalization, it surfaced as an opaque Server Action error rather than
 * anything a member could act on.
 *
 * Copying into a plain Buffer costs one memcpy and makes the fallback merely
 * slow instead of fatal. The warning is the signal that it happened at all —
 * it means the native binary is not loading and wants investigating.
 */
export function unshare(data: Buffer): Buffer {
  const shared =
    typeof SharedArrayBuffer !== 'undefined' && data.buffer instanceof SharedArrayBuffer
  if (!shared) return data
  logger.warn(
    'sharp returned SharedArrayBuffer-backed bytes — the native binary did not load and the WASM fallback is in use',
  )
  return Buffer.from(data)
}
