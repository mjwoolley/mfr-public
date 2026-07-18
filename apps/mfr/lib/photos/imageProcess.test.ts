// Unit: image normalization. sharp runs for real (fast on tiny synthetic
// images); heic-convert is mocked so we can exercise the HEIC branch without a
// real .heic sample.

import { describe, it, expect, vi } from 'vitest'
import sharp from 'sharp'
import convert from 'heic-convert'
import { normalizeImage } from './imageProcess'

vi.mock('heic-convert', () => ({ default: vi.fn() }))

function png(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer()
}

describe('normalizeImage', () => {
  it('re-encodes a normal image to JPEG and reports its dimensions', async () => {
    const input = await png(40, 30)
    const out = await normalizeImage(input, 'image/png')
    expect(out.contentType).toBe('image/jpeg')
    expect(out.width).toBe(40)
    expect(out.height).toBe(30)
    expect(out.bytes.length).toBeGreaterThan(0)
    expect(vi.mocked(convert)).not.toHaveBeenCalled()
  })

  it('downscales images larger than the max dimension', async () => {
    const input = await png(4000, 1000)
    const out = await normalizeImage(input, 'image/jpeg')
    expect(out.width).toBe(2560)
    expect(out.height).toBe(640)
  })

  it('routes HEIC through heic-convert first', async () => {
    const converted = await png(50, 50)
    vi.mocked(convert).mockResolvedValue(converted as unknown as Uint8Array)
    const out = await normalizeImage(Buffer.from('fake-heic'), 'image/heic')
    expect(vi.mocked(convert)).toHaveBeenCalledTimes(1)
    expect(out.contentType).toBe('image/jpeg')
    expect(out.width).toBe(50)
  })
})
