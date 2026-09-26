// Requirements coverage (CAP-017 Featured photos): the Featured page renders
// every featured photo in the order the read returns (most recently featured
// first — the ordering itself is asserted in galleryReads.test.ts) and shows
// an empty state. Rendered to static markup like app/page.test.tsx.
//
// The page's intro/empty copy ("Tap the star on any photo…") is an open
// question in CAP-017 (members can only feature their own photos), so only the
// uncontested parts of the wording are pinned here.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GalleryPhoto } from '@/lib/photos/gallery'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../actions', () => ({
  updatePhoto: vi.fn(),
  deletePhoto: vi.fn(),
  deletePhotos: vi.fn(),
  setFeatured: vi.fn(),
}))

const { requireApprovedMock, featuredMock } = vi.hoisted(() => ({
  requireApprovedMock: vi.fn(),
  featuredMock: vi.fn(),
}))
vi.mock('@/lib/authz', () => ({ requireApproved: requireApprovedMock }))
vi.mock('@/lib/photos/gallery', () => ({ getFeaturedPhotos: featuredMock }))

import FeaturedPage from './page'

function photo(id: string, uploadedBy: string): GalleryPhoto {
  return {
    id,
    year: 2026,
    blobUrl: `https://blob/${id}.jpg`,
    filename: `${id}.jpg`,
    byteSize: 1000,
    width: 800,
    height: 600,
    caption: null,
    featured: true,
    uploadedBy,
    createdAt: new Date(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireApprovedMock.mockResolvedValue({ user: { id: 'u1', roles: {} } })
})

async function render() {
  return renderToStaticMarkup(await FeaturedPage())
}

describe('CAP-017 Featured photos — Featured page', () => {
  it('CAP-017 · The Featured page lists every featured photo, most recently featured first', async () => {
    // Several members' photos, newest-featured first as the read returns them.
    featuredMock.mockResolvedValue([
      photo('newest', 'u2'),
      photo('middle', 'u1'),
      photo('oldest', 'u3'),
    ])
    const html = await render()
    const srcs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
    expect(srcs).toEqual([
      'https://blob/newest.jpg',
      'https://blob/middle.jpg',
      'https://blob/oldest.jpg',
    ])
    expect(html).toContain('The family’s picks.')
    expect(html).not.toContain('No featured photos yet.')
  })

  it('CAP-017 · No featured photos yet', async () => {
    featuredMock.mockResolvedValue([])
    const html = await render()
    expect(html).toContain('No featured photos yet.')
    expect(html).not.toContain('<img')
  })
})
