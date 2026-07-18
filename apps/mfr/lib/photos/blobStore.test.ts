import { describe, it, expect, vi, beforeEach } from 'vitest'

const put = vi.fn()
const del = vi.fn()
vi.mock('@vercel/blob', () => ({
  put: (...a: unknown[]) => put(...a),
  del: (...a: unknown[]) => del(...a),
}))

import { putSlideImage, deleteSlideImage } from './blobStore'

beforeEach(() => {
  put.mockReset()
  del.mockReset()
})

describe('putSlideImage', () => {
  it('uploads under a unique public photo-slides path and returns url + pathname', async () => {
    put.mockResolvedValue({
      url: 'https://x.blob.vercel-storage.com/photo-slides/abc-pic.jpg',
      pathname: 'photo-slides/abc-pic.jpg',
    })
    const file = new File(['data'], 'pic.jpg', { type: 'image/jpeg' })

    const result = await putSlideImage(file)

    expect(put).toHaveBeenCalledTimes(1)
    const [pathname, passedFile, opts] = put.mock.calls[0]
    expect(pathname).toMatch(/^photo-slides\/.+-pic\.jpg$/)
    expect(passedFile).toBe(file)
    expect(opts).toEqual({ access: 'public' })
    expect(result).toEqual({
      url: 'https://x.blob.vercel-storage.com/photo-slides/abc-pic.jpg',
      pathname: 'photo-slides/abc-pic.jpg',
    })
  })
})

describe('deleteSlideImage', () => {
  it('deletes by the blob url', async () => {
    del.mockResolvedValue(undefined)
    await deleteSlideImage('https://x.blob.vercel-storage.com/photo-slides/abc-pic.jpg')
    expect(del).toHaveBeenCalledWith('https://x.blob.vercel-storage.com/photo-slides/abc-pic.jpg')
  })
})
