// Server-side image normalization for gallery uploads. Kept as its own module
// (mocked in tests) so the upload action never touches sharp/heic-convert
// directly. Every stored image ends up as an auto-oriented, metadata-stripped
// JPEG no larger than MAX_DIMENSION on its long edge:
//   - HEIC/HEIF (iPhone default) is decoded to JPEG first via heic-convert
//     (pure-JS libheif — avoids native HEIF build issues on Vercel).
//   - sharp then auto-orients from EXIF and re-encodes; sharp drops all metadata
//     by default, so EXIF/GPS location is stripped.

import sharp from 'sharp'
import convert from 'heic-convert'
import { MAX_DIMENSION } from './constants'

export interface ProcessedImage {
  bytes: Buffer
  width: number
  height: number
  contentType: string
}

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

export async function normalizeImage(input: Buffer, contentType: string): Promise<ProcessedImage> {
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

  return { bytes: data, width: info.width, height: info.height, contentType: 'image/jpeg' }
}
