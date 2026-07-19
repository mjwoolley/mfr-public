// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PhotoGallery } from './PhotoGallery'
import type { GalleryPhoto, PhotoSection } from '@/lib/photos/gallery'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

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

beforeEach(() => {
  updatePhoto.mockResolvedValue({ ok: true })
  deletePhoto.mockResolvedValue({ ok: true })
  deletePhotos.mockResolvedValue({ ok: true })
  setFeatured.mockResolvedValue({ ok: true })
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  )
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

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
    uploadedBy: 'u1',
    createdAt: new Date(),
    ...over,
  }
}

const ME = 'u1'

function sectionsFrom(photos: GalleryPhoto[]): PhotoSection[] {
  return [{ id: 'y2026', title: '2026', blocks: [{ photos }] }]
}

describe('PhotoGallery', () => {
  it('renders section headings and one tile per photo', () => {
    render(
      <PhotoGallery
        sections={[
          {
            id: 'mike',
            title: 'Mike Woolley (you)',
            subtitle: '2 photos',
            blocks: [
              { label: '2026', photos: [photo({ id: 'a', caption: 'Alpha' })] },
              { label: '2025', photos: [photo({ id: 'b', caption: 'Beta', year: 2025 })] },
            ],
          },
        ]}
        currentUserId={ME}
        isContentAdmin={false}
      />,
    )
    expect(screen.getByText('Mike Woolley (you)')).toBeTruthy()
    expect(screen.getByText('2026')).toBeTruthy()
    expect(screen.getByText('2025')).toBeTruthy()
    expect(screen.getByAltText('Alpha')).toBeTruthy()
    expect(screen.getByAltText('Beta')).toBeTruthy()
  })

  it('selects tiles and bulk-deletes the selection', async () => {
    render(
      <PhotoGallery
        sections={sectionsFrom([
          photo({ id: 'a', caption: 'Alpha' }),
          photo({ id: 'b', caption: 'Beta' }),
        ])}
        currentUserId={ME}
        isContentAdmin={false}
      />,
    )
    // No selection bar yet.
    expect(screen.queryByText(/selected/)).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: /select photo/i })[0])
    expect(screen.getByText('1 selected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(deletePhotos).toHaveBeenCalledWith(['a']))
  })

  it('toggles featured from the on-tile star, and surfaces the cap message', async () => {
    const { rerender } = render(
      <PhotoGallery
        sections={sectionsFrom([photo({ id: 'a', caption: 'Alpha' })])}
        currentUserId={ME}
        isContentAdmin={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /feature on home/i }))
    await waitFor(() => expect(setFeatured).toHaveBeenCalledWith('a', true))

    // At the cap: the returned error becomes a visible message.
    setFeatured.mockResolvedValue({ error: 'You can feature up to 5 photos.' })
    rerender(
      <PhotoGallery
        sections={sectionsFrom([photo({ id: 'a', caption: 'Alpha' })])}
        currentUserId={ME}
        isContentAdmin={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /feature on home/i }))
    await waitFor(() => expect(screen.getByText('You can feature up to 5 photos.')).toBeTruthy())
  })

  it('opens a lightbox with Feature / Edit / Delete / Close buttons for the owner', () => {
    render(
      <PhotoGallery
        sections={sectionsFrom([photo({ id: 'a', caption: 'Alpha' })])}
        currentUserId={ME}
        isContentAdmin={false}
      />,
    )
    // The tile image button carries the caption as its label.
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    // Scope to the lightbox dialog — the on-tile star shares the "Feature" name.
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: /feature on home/i })).toBeTruthy()
    expect(dialog.getByRole('button', { name: /^edit$/i })).toBeTruthy()
    expect(dialog.getByRole('button', { name: /^delete$/i })).toBeTruthy()
    expect(dialog.getByRole('button', { name: /^close$/i })).toBeTruthy()
  })

  it('hides manage controls on another member’s photo (non-admin)', () => {
    render(
      <PhotoGallery
        sections={sectionsFrom([photo({ id: 'a', caption: 'Alpha', uploadedBy: 'someone-else' })])}
        currentUserId={ME}
        isContentAdmin={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /select photo/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /feature on home/i })).toBeNull()
  })
})
