// Unit: image normalization + EXIF capture-date read. sharp runs for real (fast
// on tiny synthetic images); heic-convert and exifr are mocked so we can
// exercise the HEIC branch and the capture-date logic deterministically.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'
import convert from 'heic-convert'
import { normalizeImage, readCaptureDate, unshare } from './imageProcess'

vi.mock('heic-convert', () => ({ default: vi.fn() }))

const loggerWarn = vi.fn()
vi.mock('@/lib/reservations/logger', () => ({
  logger: { warn: (...a: unknown[]) => loggerWarn(...a) },
}))

const exifrParse = vi.fn()
vi.mock('exifr', () => ({ default: { parse: (...a: unknown[]) => exifrParse(...a) } }))

beforeEach(() => {
  exifrParse.mockReset()
  exifrParse.mockResolvedValue(undefined) // no EXIF by default
})

function png(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer()
}

describe('readCaptureDate', () => {
  it('returns DateTimeOriginal when present', async () => {
    const taken = new Date('2019-07-04T12:00:00Z')
    exifrParse.mockResolvedValue({ DateTimeOriginal: taken })
    expect(await readCaptureDate(Buffer.from('x'))).toBe(taken)
  })

  it('falls back to CreateDate when DateTimeOriginal is absent', async () => {
    const created = new Date('2021-08-01T09:00:00Z')
    exifrParse.mockResolvedValue({ CreateDate: created })
    expect(await readCaptureDate(Buffer.from('x'))).toBe(created)
  })

  it('returns undefined when there is no date metadata', async () => {
    exifrParse.mockResolvedValue({ Orientation: 1 })
    expect(await readCaptureDate(Buffer.from('x'))).toBeUndefined()
  })

  it('ignores an invalid Date value', async () => {
    exifrParse.mockResolvedValue({ DateTimeOriginal: new Date('not-a-date') })
    expect(await readCaptureDate(Buffer.from('x'))).toBeUndefined()
  })

  it('ignores a non-Date value', async () => {
    exifrParse.mockResolvedValue({ DateTimeOriginal: '2019:07:04 12:00:00' })
    expect(await readCaptureDate(Buffer.from('x'))).toBeUndefined()
  })

  it('swallows exifr parse errors', async () => {
    exifrParse.mockRejectedValue(new Error('unsupported format'))
    expect(await readCaptureDate(Buffer.from('x'))).toBeUndefined()
  })
})

describe('normalizeImage', () => {
  it('re-encodes a normal image to JPEG and reports its dimensions', async () => {
    const input = await png(40, 30)
    const out = await normalizeImage(input, 'image/png')
    expect(out.contentType).toBe('image/jpeg')
    expect(out.width).toBe(40)
    expect(out.height).toBe(30)
    expect(out.bytes.length).toBeGreaterThan(0)
    expect(out.takenAt).toBeUndefined()
    expect(vi.mocked(convert)).not.toHaveBeenCalled()
  })

  it('surfaces the EXIF capture date as takenAt', async () => {
    const taken = new Date('2018-06-15T10:30:00Z')
    exifrParse.mockResolvedValue({ DateTimeOriginal: taken })
    const out = await normalizeImage(await png(20, 20), 'image/jpeg')
    expect(out.takenAt).toBe(taken)
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

  it('returns bytes that fetch will accept (not shared-backed)', async () => {
    const out = await normalizeImage(await png(20, 20), 'image/png')
    expect(out.bytes.buffer).not.toBeInstanceOf(SharedArrayBuffer)
  })
})

// sharp's WASM fallback hands back Buffers over a shared WebAssembly memory, and
// `fetch` rejects those outright ("ArrayBuffer: SharedArrayBuffer is not
// allowed") — which is what broke every production upload for two weeks. Only
// the native binary can be exercised here, so the guard is tested directly.
describe('unshare', () => {
  beforeEach(() => loggerWarn.mockReset())

  it('passes ordinary bytes through untouched', () => {
    const buf = Buffer.from([1, 2, 3])
    expect(unshare(buf)).toBe(buf)
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  it('copies shared-backed bytes and warns that the WASM fallback is in use', () => {
    const shared = Buffer.from(new SharedArrayBuffer(3))
    shared.set([4, 5, 6])
    expect(shared.buffer).toBeInstanceOf(SharedArrayBuffer)

    const out = unshare(shared)

    expect(out.buffer).not.toBeInstanceOf(SharedArrayBuffer)
    expect([...out]).toEqual([4, 5, 6])
    expect(loggerWarn).toHaveBeenCalledTimes(1)
  })
})
