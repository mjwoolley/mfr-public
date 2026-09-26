// @vitest-environment happy-dom
// Requirements coverage (CAP-013 Photo albums): the By Year / By Uploader
// toggle, the uploader file details, captions under tiles, and the empty
// state. Renders the real AlbumsView + PhotoGallery; the server actions,
// router and next/image are mocked (as in PhotoGallery.test.tsx).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { AlbumsView } from './AlbumsView'
import type { GalleryPhoto, PhotoSection } from '@/lib/photos/gallery'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./actions', () => ({
  updatePhoto: vi.fn(),
  deletePhoto: vi.fn(),
  deletePhotos: vi.fn(),
  setFeatured: vi.fn(),
}))

afterEach(() => cleanup())

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

const seed = photo({
  id: 'seed',
  filename: 'seed-gallery.jpg',
  width: 1600,
  height: 1200,
  byteSize: Math.round(1.5 * 1024 * 1024),
  uploadedBy: 'u2',
})

const byYear: PhotoSection[] = [{ id: 'y2026', title: '2026', blocks: [{ photos: [seed] }] }]
const byUploader: PhotoSection[] = [
  {
    id: 'u2',
    title: 'Jane Miller',
    subtitle: '1 photo',
    blocks: [{ label: '2026', photos: [seed] }],
  },
]

function renderView(y = byYear, u = byUploader) {
  return render(<AlbumsView byYear={y} byUploader={u} currentUserId="u1" isContentAdmin={false} />)
}

describe('CAP-013 Photo albums — Albums view', () => {
  it('CAP-013 · By Year is the default view', () => {
    renderView()
    expect((screen.getByLabelText('By Year') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('By Uploader') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('heading', { name: '2026' })).toBeTruthy()
    expect(screen.queryByText('Jane Miller')).toBeNull()
  })

  it('CAP-013 · Switching to By Uploader groups photos by who added them — in place, without a reload', () => {
    const { container } = renderView()
    const before = container.firstChild
    const href = window.location.href
    fireEvent.click(screen.getByLabelText('By Uploader'))
    // The uploader section replaces the year section in the same mounted tree
    // (a client-side switch — no navigation happens).
    expect(screen.getByText('Jane Miller')).toBeTruthy()
    expect(screen.getByText(/1 photo/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '2026' })).toBeNull()
    expect(container.firstChild).toBe(before)
    expect(window.location.href).toBe(href)
    expect((screen.getByLabelText('By Uploader') as HTMLInputElement).checked).toBe(true)
  })

  it('CAP-013 · By Uploader shows each photo’s file details', () => {
    renderView()
    // Not shown in the By Year view…
    expect(screen.queryByText(/seed-gallery\.jpg/)).toBeNull()
    fireEvent.click(screen.getByLabelText('By Uploader'))
    // …but under the photo in By Uploader: year, file name, dimensions, size.
    const meta = screen.getByText(/seed-gallery\.jpg/).closest('figcaption')!
    expect(meta.textContent).toContain('2026')
    expect(meta.textContent).toContain('seed-gallery.jpg')
    expect(meta.textContent).toContain('1600×1200')
    expect(meta.textContent).toContain('1.5 MB')
  })

  it('CAP-013 · Captions show under their photos', () => {
    const captioned = photo({ id: 'c', caption: 'Dock jump, 2026' })
    renderView([{ id: 'y2026', title: '2026', blocks: [{ photos: [captioned] }] }], [])
    const caption = screen.getByText('Dock jump, 2026')
    expect(caption.tagName).toBe('FIGCAPTION')
    // It sits in the same tile (figure) as the photo, after the image.
    const figure = caption.closest('figure')!
    expect(figure.querySelector('img')?.getAttribute('alt')).toBe('Dock jump, 2026')
  })

  it('CAP-013 · No photos yet', () => {
    renderView([], [])
    expect(screen.getByText('No photos yet — add the first ones above.')).toBeTruthy()
  })
})
