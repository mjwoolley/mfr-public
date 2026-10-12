// Requirements coverage (CAP-014 Add photos): image normalization run on real,
// tiny fixture images. sharp and exifr both run for real here, so the checks
// read the actual output bytes — location data gone, orientation applied,
// every accepted format decodes. heic-convert is mocked (it only decodes, so a
// HEIC fixture can't be synthesized); it hands back a real JPEG to exercise
// the HEIC branch end to end.

import { describe, it, expect, vi } from 'vitest'
import sharp from 'sharp'
import exifr from 'exifr'
import convert from 'heic-convert'
import { normalizeImage } from './imageProcess'
import { ACCEPTED_UPLOAD_TYPES } from './constants'

vi.mock('heic-convert', () => ({ default: vi.fn() }))

function base(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
}

/** A camera-style JPEG: GPS position, camera make, capture date, and EXIF
 * orientation 6 (stored sideways, "rotate 90° clockwise to view"). */
async function phoneJpeg(width: number, height: number) {
  return base(width, height)
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'TestCam' },
      IFD2: { DateTimeOriginal: '2019:07:04 12:00:00' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '35/1 25/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '82/1 12/1 0/1',
      },
    })
    .toBuffer()
}

describe('CAP-014 Add photos — image processing (real images)', () => {
  it('CAP-014 · Location data is removed from every photo I add', async () => {
    const original = await phoneJpeg(40, 20)
    // Sanity: the fixture really carries a location and a sideways orientation.
    expect(await exifr.gps(original)).toMatchObject({ latitude: expect.any(Number) })
    expect((await sharp(original).metadata()).orientation).toBe(6)

    const out = await normalizeImage(original, 'image/jpeg')

    // The photo shown to the family carries no location data (no EXIF at all).
    expect(await exifr.gps(out.bytes)).toBeUndefined()
    const meta = await exifr.parse(out.bytes, true)
    expect(meta?.GPSLatitude).toBeUndefined()
    expect(meta?.GPSLongitude).toBeUndefined()
    expect(meta?.Make).toBeUndefined()
    const outMeta = await sharp(out.bytes).metadata()
    expect(outMeta.exif).toBeUndefined()

    // ...and it is turned the right way up: the orientation was applied to the
    // pixels (40×20 stored sideways → 20×40 upright), leaving no orientation tag.
    expect(out.width).toBe(20)
    expect(out.height).toBe(40)
    expect(outMeta.width).toBe(20)
    expect(outMeta.height).toBe(40)
    expect(outMeta.orientation ?? 1).toBe(1)

    // The capture date was still read (from the original) before stripping.
    expect(out.takenAt?.getFullYear()).toBe(2019)
  })

  describe('CAP-014 · Accepted photo formats', () => {
    it('CAP-014 · Accepted photo formats — the upload gate accepts JPEG, PNG, WebP, GIF and HEIC', () => {
      expect([...ACCEPTED_UPLOAD_TYPES]).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/heic',
        'image/heif',
      ])
    })

    const rows: { format: string; contentType: string; encode: () => Promise<Buffer> }[] = [
      { format: 'JPEG', contentType: 'image/jpeg', encode: () => base(30, 10).jpeg().toBuffer() },
      { format: 'PNG', contentType: 'image/png', encode: () => base(30, 10).png().toBuffer() },
      { format: 'WebP', contentType: 'image/webp', encode: () => base(30, 10).webp().toBuffer() },
      { format: 'GIF', contentType: 'image/gif', encode: () => base(30, 10).gif().toBuffer() },
    ]

    for (const row of rows) {
      it(`CAP-014 · Accepted photo formats — ${row.format} is processed into a stored photo`, async () => {
        const input = await row.encode()
        const out = await normalizeImage(input, row.contentType)
        expect(out.contentType).toBe('image/jpeg')
        expect(out.width).toBe(30)
        expect(out.height).toBe(10)
        expect((await sharp(out.bytes).metadata()).format).toBe('jpeg')
      })
    }

    it('CAP-014 · Accepted photo formats — HEIC (iPhone) is converted and processed', async () => {
      const decoded = await base(30, 10).jpeg().toBuffer()
      vi.mocked(convert).mockResolvedValue(decoded)
      const out = await normalizeImage(Buffer.from('heic-bytes'), 'image/heic')
      expect(vi.mocked(convert)).toHaveBeenCalledTimes(1)
      expect(out.contentType).toBe('image/jpeg')
      expect((await sharp(out.bytes).metadata()).format).toBe('jpeg')
      expect(out.width).toBe(30)
    })
  })

  it('CAP-014 · An unreadable image is refused — processing rejects bytes that are not an image', async () => {
    await expect(
      normalizeImage(Buffer.from('this is not an image'), 'image/jpeg'),
    ).rejects.toThrow()
  })
})
