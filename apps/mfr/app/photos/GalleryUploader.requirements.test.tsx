// @vitest-environment happy-dom
// Requirements coverage (CAP-014 Add photos): the uploader's progress modal,
// the 25 MB boundary, and the exact wording of the per-batch failure report.
// Blob upload and finalizeUpload are mocked, as in GalleryUploader.test.tsx.

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

/** A promise the test resolves by hand, to hold an upload "in flight". */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('CAP-014 Add photos — uploader', () => {
  it('CAP-014 · I can add several photos at once', async () => {
    const inFlight = [
      deferred<{ url: string }>(),
      deferred<{ url: string }>(),
      deferred<{ url: string }>(),
    ]
    inFlight.forEach((d) => upload.mockReturnValueOnce(d.promise))
    render(<GalleryUploader year={2026} />)
    pick([file('a.jpg'), file('b.jpg'), file('c.jpg')])

    // "Adding photos" with "Uploading 1 of 3…" while the first goes up.
    const modal = await screen.findByRole('alertdialog', { name: 'Adding photos' })
    expect(modal.textContent).toContain('Adding photos')
    await waitFor(() => expect(modal.textContent).toContain('Uploading 1 of 3…'))

    inFlight[0].resolve({ url: 'https://blob/a.jpg' })
    await waitFor(() => expect(modal.textContent).toContain('Uploading 2 of 3…'))
    inFlight[1].resolve({ url: 'https://blob/b.jpg' })
    await waitFor(() => expect(modal.textContent).toContain('Uploading 3 of 3…'))
    expect(refresh).not.toHaveBeenCalled()
    inFlight[2].resolve({ url: 'https://blob/c.jpg' })

    // All 3 added; the albums refresh in place (router.refresh, no reload) and
    // the progress modal goes away with no failure report.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(finalizeUpload).toHaveBeenCalledTimes(3)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('CAP-014 · A single photo shows a single-photo progress message', async () => {
    const d = deferred<{ url: string }>()
    upload.mockReturnValueOnce(d.promise)
    render(<GalleryUploader year={2026} />)
    pick([file('only.jpg')])

    const modal = await screen.findByRole('alertdialog', { name: 'Adding photos' })
    expect(modal.textContent).toContain('Uploading your photo…')
    expect(modal.textContent).not.toMatch(/Uploading \d+ of/)
    d.resolve({ url: 'https://blob/only.jpg' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('CAP-014 · Photos over 25 MB are refused before uploading — exactly 25 MB is added', async () => {
    render(<GalleryUploader year={2026} />)
    pick([file('exact.jpg', MAX_UPLOAD_BYTES)])

    await waitFor(() => expect(finalizeUpload).toHaveBeenCalledTimes(1))
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024)
    expect(upload).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('CAP-014 · Photos over 25 MB are refused before uploading — over 25 MB is reported and not sent', async () => {
    render(<GalleryUploader year={2026} />)
    pick([file('huge.jpg', MAX_UPLOAD_BYTES + 1)])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('huge.jpg — Larger than 25 MB.')
    expect(upload).not.toHaveBeenCalled()
    expect(finalizeUpload).not.toHaveBeenCalled()
  })

  it('CAP-014 · Every failed photo is named in a batch report', async () => {
    finalizeUpload
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        error: 'That image could not be processed. Try a different photo.',
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ error: 'Your photo could not be saved. Please try again.' })
    render(<GalleryUploader year={2026} />)
    pick([file('one.jpg'), file('two.heic'), file('three.jpg'), file('four.png')])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('2 of 4 photos added — 2 couldn’t be added:')
    const items = [...alert.querySelectorAll('li')].map((li) => li.textContent)
    expect(items).toEqual([
      'two.heic — That image could not be processed. Try a different photo.',
      'four.png — Your photo could not be saved. Please try again.',
    ])
    expect(alert.textContent).toContain(
      'Nothing was saved for the photos listed above. You can select them and try again.',
    )
    expect(alert.textContent).not.toContain('one.jpg')
    expect(alert.textContent).not.toContain('three.jpg')
    // The 2 that succeeded appear: the albums are refreshed.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('CAP-014 · A single photo that fails', async () => {
    finalizeUpload.mockResolvedValue({ error: 'Your photo could not be saved. Please try again.' })
    render(<GalleryUploader year={2026} />)
    pick([file('lonely.jpg')])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('That photo couldn’t be added:')
    expect(alert.querySelector('li')?.textContent).toBe(
      'lonely.jpg — Your photo could not be saved. Please try again.',
    )
    expect(refresh).not.toHaveBeenCalled()
  })

  it('CAP-014 · A whole batch that fails — 3 photos', async () => {
    finalizeUpload.mockResolvedValue({ error: 'Your photo could not be saved. Please try again.' })
    render(<GalleryUploader year={2026} />)
    pick([file('a.jpg'), file('b.jpg'), file('c.jpg')])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('None of the 3 photos could be added:')
    expect(alert.querySelectorAll('li')).toHaveLength(3)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('CAP-014 · An unreadable image is refused — its message is listed against the file', async () => {
    finalizeUpload.mockResolvedValue({
      error: 'That image could not be processed. Try a different photo.',
    })
    render(<GalleryUploader year={2026} />)
    pick([file('notes.jpg')])

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('li')?.textContent).toBe(
      'notes.jpg — That image could not be processed. Try a different photo.',
    )
  })

  it('CAP-014 · Accepted photo formats — each format is sent with its image type', async () => {
    render(<GalleryUploader year={2026} />)
    // Browsers sometimes report no type; the extension must still map to an
    // accepted type so the upload gate lets it through.
    pick([
      file('a.jpg', 1000, ''),
      file('b.png', 1000, ''),
      file('c.webp', 1000, ''),
      file('d.gif', 1000, ''),
      file('e.heic', 1000, ''),
    ])
    await waitFor(() => expect(finalizeUpload).toHaveBeenCalledTimes(5))
    expect(
      finalizeUpload.mock.calls.map((c) => (c[0] as { contentType: string }).contentType),
    ).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
