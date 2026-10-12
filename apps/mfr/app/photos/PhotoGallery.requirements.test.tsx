// @vitest-environment happy-dom
// Requirements coverage for the gallery UI: the enlarged view and its controls
// (CAP-015), delete confirmation and multi-select (CAP-016), and the feature
// star / lightbox button / cap message (CAP-017). Server actions, router and
// next/image are mocked, as in PhotoGallery.test.tsx.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PhotoGallery } from './PhotoGallery'
import type { GalleryPhoto, PhotoSection } from '@/lib/photos/gallery'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const updatePhoto = vi.fn()
const deletePhoto = vi.fn()
const deletePhotos = vi.fn()
const setFeatured = vi.fn()
vi.mock('./actions', () => ({
  updatePhoto: (...a: unknown[]) => updatePhoto(...a),
  deletePhoto: (...a: unknown[]) => deletePhoto(...a),
  deletePhotos: (...a: unknown[]) => deletePhotos(...a),
  setFeatured: (...a: unknown[]) => setFeatured(...a),
}))

const confirmMock = vi.fn<(message?: string) => boolean>(() => true)

beforeEach(() => {
  updatePhoto.mockResolvedValue({ ok: true })
  deletePhoto.mockResolvedValue({ ok: true })
  deletePhotos.mockResolvedValue({ ok: true })
  setFeatured.mockResolvedValue({ ok: true })
  confirmMock.mockReturnValue(true)
  vi.stubGlobal('confirm', confirmMock)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const ME = 'u1'
const OTHER = 'u2'

function photo(over: Partial<GalleryPhoto> = {}): GalleryPhoto {
  return {
    id: 'p1',
    year: 2026,
    blobUrl: 'https://blob/p1.jpg',
    filename: 'p1.jpg',
    byteSize: 1000,
    width: 800,
    height: 600,
    caption: null,
    featured: false,
    uploadedBy: ME,
    createdAt: new Date(),
    ...over,
  }
}

function sectionsFrom(photos: GalleryPhoto[]): PhotoSection[] {
  return [{ id: 'y2026', title: '2026', blocks: [{ photos }] }]
}

function gallery(photos: GalleryPhoto[], opts: { admin?: boolean } = {}) {
  return (
    <PhotoGallery
      sections={sectionsFrom(photos)}
      currentUserId={ME}
      isContentAdmin={opts.admin ?? false}
    />
  )
}

function open(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
  return within(screen.getByRole('dialog'))
}

describe('CAP-015 Photo details — enlarged view', () => {
  it('CAP-015 · Any member can open a photo large', () => {
    render(
      gallery([
        photo({
          id: 'a',
          caption: 'Grandma on the dock',
          filename: 'dock.jpg',
          width: 1600,
          height: 1200,
          byteSize: Math.round(2.4 * 1024 * 1024),
          year: 2019,
          uploadedBy: OTHER,
        }),
      ]),
    )
    const dialog = open('Grandma on the dock')
    // The whole photo, enlarged…
    expect(dialog.getByRole('img').getAttribute('src')).toBe('https://blob/p1.jpg')
    // …with its year, file name, dimensions and file size, and its caption.
    expect(dialog.getByText('2019')).toBeTruthy()
    expect(dialog.getByText(/dock\.jpg · 1600×1200 · 2\.4 MB/)).toBeTruthy()
    expect(dialog.getByText('Grandma on the dock', { selector: 'p' })).toBeTruthy()
  })

  it('CAP-015 · Closing the enlarged photo — the Close button', () => {
    render(gallery([photo({ id: 'a', caption: 'Alpha' })]))
    const dialog = open('Alpha')
    fireEvent.click(dialog.getByRole('button', { name: /^close$/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy()
  })

  it('CAP-015 · Closing the enlarged photo — clicking outside the photo', () => {
    render(gallery([photo({ id: 'a', caption: 'Alpha' })]))
    open('Alpha')
    // A click inside the card keeps it open; a click on the backdrop closes it.
    fireEvent.click(screen.getByRole('dialog').querySelector('img')!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('CAP-015 · I can only look at another member’s photo', () => {
    render(gallery([photo({ id: 'a', caption: 'Theirs', uploadedBy: OTHER })]))
    const dialog = open('Theirs')
    const labels = dialog.getAllByRole('button').map((b) => b.textContent?.trim())
    expect(labels).toEqual(['Close'])
    expect(dialog.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(dialog.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(dialog.queryByRole('button', { name: /feature on home/i })).toBeNull()
  })

  it('CAP-015 · A content admin can fix any member’s photo — Edit and Delete are offered', () => {
    render(gallery([photo({ id: 'a', caption: 'Theirs', uploadedBy: OTHER })], { admin: true }))
    const dialog = open('Theirs')
    expect(dialog.getByRole('button', { name: /^edit$/i })).toBeTruthy()
    expect(dialog.getByRole('button', { name: /^delete$/i })).toBeTruthy()
    // Admins moderate; they cannot feature someone else's photo.
    expect(dialog.queryByRole('button', { name: /feature on home/i })).toBeNull()
  })

  it('CAP-015 · Clearing a caption removes it', async () => {
    const id = '0f0f0f0f-0000-4000-8000-000000000001'
    const { rerender } = render(gallery([photo({ id, caption: 'Old caption' })]))
    const dialog = open('Old caption')
    fireEvent.click(dialog.getByRole('button', { name: /^edit$/i }))
    fireEvent.change(dialog.getByLabelText('Caption'), { target: { value: '' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updatePhoto).toHaveBeenCalledWith(id, { year: 2026, caption: '' }))

    // Once saved (the action stores an empty caption), the photo shows none.
    rerender(gallery([photo({ id, caption: '' })]))
    expect(document.querySelectorAll('figcaption')).toHaveLength(0)
    expect(screen.queryByText('Old caption')).toBeNull()
  })

  it('CAP-015 · Cancelling an edit keeps the photo unchanged', () => {
    render(gallery([photo({ id: 'a', caption: 'Original', year: 2026 })]))
    const dialog = open('Original')
    fireEvent.click(dialog.getByRole('button', { name: /^edit$/i }))
    fireEvent.change(dialog.getByLabelText('Year'), { target: { value: '1999' } })
    fireEvent.change(dialog.getByLabelText('Caption'), { target: { value: 'Changed' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel edit' }))

    expect(updatePhoto).not.toHaveBeenCalled()
    expect(dialog.queryByRole('button', { name: 'Save changes' })).toBeNull()
    expect(dialog.getByText('Original', { selector: 'p' })).toBeTruthy()
    expect(dialog.getByText('2026')).toBeTruthy()
    // Re-opening the form starts from the saved values, not the abandoned edit.
    fireEvent.click(dialog.getByRole('button', { name: /^edit$/i }))
    expect((dialog.getByLabelText('Year') as HTMLInputElement).value).toBe('2026')
    expect((dialog.getByLabelText('Caption') as HTMLTextAreaElement).value).toBe('Original')
  })
})

describe('CAP-016 Delete photos — UI', () => {
  it('CAP-016 · The owner deletes one photo after confirming', async () => {
    render(gallery([photo({ id: 'a', caption: 'Mine' })]))
    const dialog = open('Mine')
    fireEvent.click(dialog.getByRole('button', { name: /^delete$/i }))
    // Asked first. (The "backup is kept for 30 days" wording is an open
    // question in CAP-016/CAP-019, so only the question itself is pinned.)
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(confirmMock.mock.calls[0][0]).toMatch(/^Delete this photo\?/)
    await waitFor(() => expect(deletePhoto).toHaveBeenCalledWith('a'))
    // The enlarged view closes and the albums refresh without the photo.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(refresh).toHaveBeenCalled()
  })

  it('CAP-016 · Declining the confirmation keeps the photo', async () => {
    confirmMock.mockReturnValue(false)
    render(gallery([photo({ id: 'a', caption: 'Mine' })]))
    const dialog = open('Mine')
    fireEvent.click(dialog.getByRole('button', { name: /^delete$/i }))
    expect(confirmMock).toHaveBeenCalledTimes(1)
    await act(async () => {})
    expect(deletePhoto).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('CAP-016 · I can select several of my photos and delete them together', async () => {
    render(
      gallery([
        photo({ id: 'a', caption: 'A' }),
        photo({ id: 'b', caption: 'B' }),
        photo({ id: 'c', caption: 'C' }),
        photo({ id: 'd', caption: 'D' }),
      ]),
    )
    const circles = screen.getAllByRole('button', { name: 'Select photo' })
    fireEvent.click(circles[0])
    fireEvent.click(circles[1])
    fireEvent.click(circles[2])
    expect(screen.getByText('3 selected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(confirmMock.mock.calls[0][0]).toMatch(/^Delete 3 photos\?/)
    await waitFor(() => expect(deletePhotos).toHaveBeenCalledWith(['a', 'b', 'c']))
    // The selection bar goes away and the albums refresh without them.
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull())
    expect(refresh).toHaveBeenCalled()
  })

  it('CAP-016 · Clearing a selection', () => {
    render(gallery([photo({ id: 'a', caption: 'A' }), photo({ id: 'b', caption: 'B' })]))
    for (const c of screen.getAllByRole('button', { name: 'Select photo' })) fireEvent.click(c)
    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText(/selected$/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deselect photo' })).toBeNull()
    expect(deletePhotos).not.toHaveBeenCalled()
  })

  it('CAP-016 · A content admin can delete any member’s photos — select circles on everyone’s', async () => {
    render(
      gallery(
        [
          photo({ id: 'x', caption: 'X', uploadedBy: OTHER }),
          photo({ id: 'y', caption: 'Y', uploadedBy: 'u3' }),
        ],
        { admin: true },
      ),
    )
    const circles = screen.getAllByRole('button', { name: 'Select photo' })
    expect(circles).toHaveLength(2)
    circles.forEach((c) => fireEvent.click(c))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(deletePhotos).toHaveBeenCalledWith(['x', 'y']))
  })
})

describe('CAP-017 Featured photos — UI', () => {
  it('CAP-017 · I feature one of my own photos — the star shows "Featured on the home page"', async () => {
    const { rerender } = render(gallery([photo({ id: 'a', caption: 'Mine' })]))
    const star = screen.getByRole('button', { name: 'Feature on home' })
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    await waitFor(() => expect(setFeatured).toHaveBeenCalledWith('a', true))
    await waitFor(() => expect(refresh).toHaveBeenCalled())

    // After the refresh the photo comes back featured.
    rerender(gallery([photo({ id: 'a', caption: 'Mine', featured: true })]))
    const on = screen.getByRole('button', { name: 'Unfeature photo' })
    expect(on.getAttribute('title')).toBe('Featured on the home page')
    expect(on.getAttribute('aria-pressed')).toBe('true')
  })

  it('CAP-017 · I can also feature from the enlarged photo', async () => {
    const { rerender } = render(gallery([photo({ id: 'a', caption: 'Mine' })]))
    const dialog = open('Mine')
    fireEvent.click(dialog.getByRole('button', { name: /feature on home/i }))
    await waitFor(() => expect(setFeatured).toHaveBeenCalledWith('a', true))
    await waitFor(() => expect(refresh).toHaveBeenCalled())

    rerender(gallery([photo({ id: 'a', caption: 'Mine', featured: true })]))
    const after = within(screen.getByRole('dialog'))
    expect(after.getByRole('button', { name: 'Unfeature' })).toBeTruthy()
    expect(after.queryByRole('button', { name: /feature on home/i })).toBeNull()
  })

  it('CAP-017 · The limit message goes away on its own', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setFeatured.mockResolvedValue({ error: 'You can feature up to 5 photos.' })
    render(gallery([photo({ id: 'a', caption: 'Mine' })]))
    fireEvent.click(screen.getByRole('button', { name: 'Feature on home' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('status').textContent).toBe('You can feature up to 5 photos.')

    // Still there a moment later…
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByText('You can feature up to 5 photos.')).toBeTruthy()
    // …gone after a few seconds, with nothing tapped.
    act(() => vi.advanceTimersByTime(600))
    expect(screen.queryByText('You can feature up to 5 photos.')).toBeNull()
  })

  it('CAP-017 · Other members’ photos don’t offer a star — featured or not, tile or enlarged', () => {
    render(
      gallery([
        photo({ id: 'a', caption: 'Plain', uploadedBy: OTHER }),
        photo({ id: 'b', caption: 'Starred', uploadedBy: OTHER, featured: true }),
      ]),
    )
    expect(screen.queryByRole('button', { name: /feature on home|unfeature/i })).toBeNull()
    for (const label of ['Plain', 'Starred']) {
      const dialog = open(label)
      expect(dialog.queryByRole('button', { name: /feature on home|unfeature/i })).toBeNull()
      fireEvent.click(dialog.getByRole('button', { name: /^close$/i }))
    }
  })

  it('CAP-017 · A content admin can unfeature anyone’s photo but not feature it', async () => {
    render(
      gallery(
        [
          photo({ id: 'f', caption: 'Their featured', uploadedBy: OTHER, featured: true }),
          photo({ id: 'n', caption: 'Their plain', uploadedBy: OTHER }),
        ],
        { admin: true },
      ),
    )
    // Tiles: an Unfeature star on the featured one, no star on the other.
    const stars = screen.getAllByRole('button', { name: /feature on home|unfeature photo/i })
    expect(stars.map((s) => s.getAttribute('aria-label'))).toEqual(['Unfeature photo'])

    // Enlarged: "Unfeature" on the featured one…
    let dialog = open('Their featured')
    fireEvent.click(dialog.getByRole('button', { name: 'Unfeature' }))
    await waitFor(() => expect(setFeatured).toHaveBeenCalledWith('f', false))
    fireEvent.click(dialog.getByRole('button', { name: /^close$/i }))

    // …and no feature button on the one that isn't featured.
    dialog = open('Their plain')
    expect(dialog.queryByRole('button', { name: /feature on home|unfeature/i })).toBeNull()
  })
})
