import { describe, it, expect, vi, beforeEach } from 'vitest'

const put = vi.fn()
const del = vi.fn()
vi.mock('@vercel/blob', () => ({
  put: (...a: unknown[]) => put(...a),
  del: (...a: unknown[]) => del(...a),
}))

import { putGalleryImage, deleteBlobObject, fetchBlobBytes } from './blobStore'

beforeEach(() => {
  put.mockReset()
  del.mockReset()
})

describe('putGalleryImage', () => {
  it('uploads raw bytes to the given path with content type and returns url + pathname', async () => {
    put.mockResolvedValue({
      url: 'https://x.blob.vercel-storage.com/gallery/2026/abc.jpg',
      pathname: 'gallery/2026/abc.jpg',
    })
    const bytes = Buffer.from('image-data')

    const result = await putGalleryImage('gallery/2026/abc.jpg', bytes, 'image/jpeg')

    expect(put).toHaveBeenCalledTimes(1)
    const [pathname, passedBytes, opts] = put.mock.calls[0]
    expect(pathname).toBe('gallery/2026/abc.jpg')
    expect(passedBytes).toBe(bytes)
    expect(opts).toEqual({ access: 'public', contentType: 'image/jpeg' })
    expect(result).toEqual({
      url: 'https://x.blob.vercel-storage.com/gallery/2026/abc.jpg',
      pathname: 'gallery/2026/abc.jpg',
    })
  })
})

describe('deleteBlobObject', () => {
  it('deletes by the blob url', async () => {
    del.mockResolvedValue(undefined)
    await deleteBlobObject('https://x.blob.vercel-storage.com/gallery/2026/abc.jpg')
    expect(del).toHaveBeenCalledWith('https://x.blob.vercel-storage.com/gallery/2026/abc.jpg')
  })
})

describe('fetchBlobBytes', () => {
  it('returns the fetched bytes as a Buffer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('hi').buffer,
    })
    vi.stubGlobal('fetch', fetchMock)

    const buf = await fetchBlobBytes('https://x.blob.vercel-storage.com/tmp/orig.jpg')

    expect(fetchMock).toHaveBeenCalledWith('https://x.blob.vercel-storage.com/tmp/orig.jpg')
    expect(buf.toString()).toBe('hi')
    vi.unstubAllGlobals()
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(
      fetchBlobBytes('https://x.blob.vercel-storage.com/tmp/missing.jpg'),
    ).rejects.toThrow(/failed to fetch blob \(404\)/)
    vi.unstubAllGlobals()
  })
})
