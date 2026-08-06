// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GalleryUploader } from './GalleryUploader'
import { MAX_UPLOAD_BYTES } from '@/lib/photos/constants'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const upload = vi.fn()
vi.mock('@vercel/blob/client', () => ({
  upload: (...a: unknown[]) => upload(...a),
}))

const finalizeUpload = vi.fn()
vi.mock('./actions', () => ({
  finalizeUpload: (...a: unknown[]) => finalizeUpload(...a),
}))

beforeEach(() => {
  upload.mockResolvedValue({ url: 'https://blob/tmp.jpg' })
  finalizeUpload.mockResolvedValue({ ok: true })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** A File whose reported size can exceed what we can actually allocate. */
function file(name: string, size = 1000, type = 'image/jpeg'): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

function pick(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

describe('GalleryUploader', () => {
  it('adds every photo and refreshes when all succeed, reporting no failures', async () => {
    render(<GalleryUploader year={2026} />)
    pick([file('a.jpg'), file('b.jpg')])

    await waitFor(() => expect(finalizeUpload).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // The bug this component had: one error slot, overwritten per file, so a photo
  // that never uploaded looked identical to one that did.
  it('names every failed file rather than keeping only the last error', async () => {
    finalizeUpload
      .mockResolvedValueOnce({ error: 'That image could not be processed.' })
      .mockResolvedValueOnce({ error: 'Something else went wrong.' })
    render(<GalleryUploader year={2026} />)
    pick([file('first.heic'), file('second.heic')])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('first.heic')
    expect(alert.textContent).toContain('That image could not be processed.')
    // The earlier failure must survive the later one.
    expect(alert.textContent).toContain('second.heic')
    expect(alert.textContent).toContain('Something else went wrong.')
  })

  it('reports a partial batch as partial, and still refreshes for the ones that landed', async () => {
    finalizeUpload
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ error: 'Processing failed.' })
    render(<GalleryUploader year={2026} />)
    pick([file('good.jpg'), file('bad.heic')])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('1 of 2 photos added')
    expect(alert.textContent).toContain('bad.heic')
    expect(alert.textContent).not.toContain('good.jpg')
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('does not refresh when nothing landed', async () => {
    finalizeUpload.mockResolvedValue({ error: 'Processing failed.' })
    render(<GalleryUploader year={2026} />)
    pick([file('a.jpg'), file('b.jpg')])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('None of the 2 photos could be added')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reports an oversized file without attempting to upload it', async () => {
    render(<GalleryUploader year={2026} />)
    pick([file('huge.jpg', MAX_UPLOAD_BYTES + 1)])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('huge.jpg')
    expect(alert.textContent).toContain('Larger than 25 MB.')
    expect(upload).not.toHaveBeenCalled()
  })

  it('reports a thrown upload error against the file that threw', async () => {
    upload.mockRejectedValueOnce(new Error('Network request failed'))
    render(<GalleryUploader year={2026} />)
    pick([file('dropped.jpg')])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('dropped.jpg')
    expect(alert.textContent).toContain('Network request failed')
  })

  it('keeps the failure report until it is dismissed', async () => {
    finalizeUpload.mockResolvedValue({ error: 'Processing failed.' })
    render(<GalleryUploader year={2026} />)
    pick([file('a.jpg')])

    const alert = await screen.findByRole('alert')
    expect(alert).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('files the upload under the year it was handed', async () => {
    render(<GalleryUploader year={2026} />)
    pick([file('a.jpg')])

    await waitFor(() => expect(finalizeUpload).toHaveBeenCalled())
    expect(finalizeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2026, filename: 'a.jpg', contentType: 'image/jpeg' }),
    )
  })

  it('infers a content type from the extension when the browser reports none', async () => {
    render(<GalleryUploader year={2026} />)
    pick([file('IMG_0001.HEIC', 1000, '')])

    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(finalizeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/heic' }),
    )
  })
})
