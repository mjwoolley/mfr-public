// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { GalleryGrid } from './GalleryGrid'
import type { GalleryPhoto } from '@/lib/photos/gallery'

// next/image needs the Next runtime image config; render a plain img that keeps
// the width/height/style we care about (natural-ratio sizing).
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    style,
  }: {
    src: string
    alt: string
    width?: number
    height?: number
    style?: React.CSSProperties
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} style={style} />
  ),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

vi.mock('./actions', () => ({
  updatePhoto: vi.fn(),
  deletePhoto: vi.fn(),
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

describe('GalleryGrid', () => {
  it('renders each photo at its natural size, scaled to the column (no forced square)', () => {
    const { container } = render(
      <GalleryGrid
        photos={[
          photo({ id: 'a', blobUrl: 'https://blob/a.jpg', width: 800, height: 600 }),
          photo({ id: 'b', blobUrl: 'https://blob/b.jpg', width: 600, height: 800 }),
        ]}
        currentUserId="u1"
        isContentAdmin={false}
      />,
    )

    // Masonry container: fluid CSS columns rather than a fixed grid.
    const masonry = container.querySelector('div') as HTMLElement
    expect(masonry.style.columnWidth).toBeTruthy()

    const landscape = container.querySelector('img[src="https://blob/a.jpg"]') as HTMLImageElement
    const portrait = container.querySelector('img[src="https://blob/b.jpg"]') as HTMLImageElement

    // Intrinsic dimensions are passed through so each tile keeps its own ratio…
    expect(landscape.getAttribute('width')).toBe('800')
    expect(landscape.getAttribute('height')).toBe('600')
    expect(portrait.getAttribute('width')).toBe('600')
    expect(portrait.getAttribute('height')).toBe('800')

    // …and the image scales to the column width, height following the ratio.
    for (const img of [landscape, portrait]) {
      expect(img.style.width).toBe('100%')
      expect(img.style.height).toBe('auto')
      // No cover-crop: the tile is not locked to a 1:1 box.
      expect(img.style.objectFit).not.toBe('cover')
    }
  })

  it('opens a lightbox showing the whole (contain) image when a tile is clicked', () => {
    render(
      <GalleryGrid
        photos={[photo({ id: 'a', blobUrl: 'https://blob/a.jpg', width: 800, height: 600 })]}
        currentUserId="u1"
        isContentAdmin={false}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Photo from 2026' }))

    const dialog = screen.getByRole('dialog')
    const full = dialog.querySelector('img[src="https://blob/a.jpg"]') as HTMLImageElement
    expect(full).not.toBeNull()
    expect(full.style.objectFit).toBe('contain')
  })
})
