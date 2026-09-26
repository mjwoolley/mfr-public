// Requirements coverage (CAP-014 Add photos): the Albums page's help text and
// that the uploader is handed the admin-set reunion year as its fallback filing
// year. The page is an async server component rendered to static markup (the
// same approach as app/page.test.tsx); data reads and the client children are
// mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { requireApprovedMock, settingsMock, sectionsMock } = vi.hoisted(() => ({
  requireApprovedMock: vi.fn(),
  settingsMock: vi.fn(),
  sectionsMock: vi.fn(),
}))

vi.mock('@/lib/authz', () => ({ requireApproved: requireApprovedMock }))
vi.mock('@/lib/portal', () => ({ getPortalSettings: settingsMock }))
vi.mock('@/lib/photos/gallery', () => ({ getAlbumSections: sectionsMock }))
vi.mock('./GalleryUploader', () => ({
  GalleryUploader: ({ year }: { year: number }) => <div data-testid="uploader" data-year={year} />,
}))
vi.mock('./AlbumsView', () => ({ AlbumsView: () => <div data-testid="albums" /> }))

import PhotosPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  requireApprovedMock.mockResolvedValue({ user: { id: 'u1', roles: {} } })
  sectionsMock.mockResolvedValue({ byYear: [], byUploader: [] })
})

async function render() {
  return renderToStaticMarkup(await PhotosPage())
}

describe('CAP-014 Add photos — Albums page', () => {
  it('CAP-014 · The page explains what happens to my photos', async () => {
    settingsMock.mockResolvedValue({ reunionYear: 2026 })
    const html = (await render()).replace(/\s+/g, ' ')
    expect(html).toContain(
      'JPEG, PNG, WebP, GIF or HEIC (iPhone). Photos are filed by their capture date; large photos are resized and your location data is removed automatically.',
    )
  })

  it('CAP-014 · A photo with no taken date is filed under the current reunion year — the uploader gets the admin-set year', async () => {
    settingsMock.mockResolvedValue({ reunionYear: 2031 })
    const html = await render()
    expect(html).toContain('data-year="2031"')
  })
})
