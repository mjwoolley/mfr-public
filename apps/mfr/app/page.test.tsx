import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// next/image needs the Next.js runtime image config; render a plain img.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

// Hoisted so the vi.mock factories (which run before the file body) can use them.
const { authMock, settingsMock, fundraisingMock, eventsMock, featuredMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  settingsMock: vi.fn(),
  fundraisingMock: vi.fn(),
  eventsMock: vi.fn(),
  featuredMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/portal', () => ({
  getPortalSettings: settingsMock,
  getFundraising: fundraisingMock,
  getEvents: eventsMock,
}))
vi.mock('@/lib/photos/gallery', () => ({ getFeaturedPhotos: featuredMock }))

import Home from './page'

const settings = {
  id: 'singleton',
  reunionYear: 2026,
  reunionStart: '2026-07-01',
  reunionEnd: '2026-07-05',
  driveUrl: '',
  venmoUrl: 'https://venmo.com/u/Miller-Family-Lake',
  chatUrl: '',
  updatedAt: new Date(),
}

const signedInSession = {
  user: { id: 'u1', email: 'member@example.com', roles: {} },
}

async function render() {
  return renderToStaticMarkup(await Home())
}

beforeEach(() => {
  vi.clearAllMocks()
  settingsMock.mockResolvedValue(settings)
  fundraisingMock.mockResolvedValue({ year: 2026, raised: 7400, goal: 12000 })
  eventsMock.mockResolvedValue([])
  featuredMock.mockResolvedValue([])
})

describe('home page — hero slideshow source', () => {
  it('shows the static fallback for signed-out visitors (never member photos)', async () => {
    authMock.mockResolvedValue(null)
    const html = await render()
    expect(html).toContain('/lake-house.jpg')
  })

  it('rotates through the featured photos in the hero when signed in', async () => {
    authMock.mockResolvedValue(signedInSession)
    featuredMock.mockResolvedValue([
      featuredPhoto({ id: 'p1', blobUrl: 'https://blob/hero-1.jpg' }),
      featuredPhoto({ id: 'p2', blobUrl: 'https://blob/hero-2.jpg' }),
    ])
    const html = await render()
    expect(html).toContain('https://blob/hero-1.jpg')
    expect(html).toContain('https://blob/hero-2.jpg')
    expect(html).not.toContain('/lake-house.jpg')
  })

  it('falls back to the static image when signed in but nothing is featured', async () => {
    authMock.mockResolvedValue(signedInSession)
    featuredMock.mockResolvedValue([])
    const html = await render()
    expect(html).toContain('/lake-house.jpg')
  })
})

describe('home page — hero (always shown)', () => {
  it('renders the reworked hero for signed-out visitors', async () => {
    authMock.mockResolvedValue(null)
    const html = await render()
    expect(html).toContain('Lake Lure, North Carolina')
    expect(html).toContain('Sixty summers')
    expect(html).toContain('For more than 60 years')
  })

  it('drops the old app cards and hero CTA buttons', async () => {
    authMock.mockResolvedValue(signedInSession)
    const html = await render()
    expect(html).not.toContain('Plan a stay')
    expect(html).not.toContain('Open Reservations')
    expect(html).not.toContain('Two things to do here')
  })
})

describe('home page — signed out', () => {
  beforeEach(() => authMock.mockResolvedValue(null))

  it('shows a sign-in prompt instead of the goal card', async () => {
    const html = await render()
    expect(html).toContain('Sign in to see this year')
    expect(html).not.toContain('2026 goal')
  })

  it('hides the upcoming events section', async () => {
    const html = await render()
    expect(html).not.toContain('Upcoming events')
  })

  it('does not fetch member-only data', async () => {
    await render()
    expect(fundraisingMock).not.toHaveBeenCalled()
    expect(eventsMock).not.toHaveBeenCalled()
  })
})

describe('home page — signed in', () => {
  beforeEach(() => authMock.mockResolvedValue(signedInSession))

  it('shows the live fundraising goal card', async () => {
    const html = await render()
    expect(html).toContain('2026 goal')
    expect(html).toContain('$7,400')
    expect(html).toContain('$12,000')
    expect(html).toContain('Venmo')
    expect(html).toContain('62% funded')
  })

  it('renders a single-day event as weekday · time', async () => {
    eventsMock.mockResolvedValue([
      {
        id: 'e1',
        startDate: '2026-07-04',
        endDate: null,
        time: '6:00 PM ET',
        description: 'Fireworks on the dock',
        meetingLink: null,
      },
    ])
    const html = await render()
    expect(html).toContain('Upcoming events')
    expect(html).toContain('Fireworks on the dock')
    expect(html).toContain('Saturday · 6:00 PM ET')
  })

  it('renders a multi-day event as a date range', async () => {
    eventsMock.mockResolvedValue([
      {
        id: 'e2',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        time: '',
        description: 'Reunion week',
        meetingLink: null,
      },
    ])
    const html = await render()
    expect(html).toContain('Reunion week')
    expect(html).toContain('Jul 1 – Jul 5')
  })
})

function featuredPhoto(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    year: 2026,
    blobUrl: 'https://blob/feat-1.jpg',
    filename: 'a.jpg',
    byteSize: 1000,
    width: 800,
    height: 600,
    caption: null,
    featured: true,
    uploadedBy: 'u1',
    createdAt: new Date(),
    ...over,
  }
}

describe('home page — featured photos in the hero', () => {
  beforeEach(() => authMock.mockResolvedValue(signedInSession))

  it('drops the old family-album caption and the standalone featured card', async () => {
    featuredMock.mockResolvedValue([featuredPhoto({ id: 'p1' })])
    const html = await render()
    expect(html).not.toContain('From the family album')
    expect(html).not.toContain('Featured by the family')
    // The Featured gallery is reachable from /photos, not a card on the home page.
    expect(html).not.toContain('href="/photos/featured"')
  })

  it('never fetches or shows featured photos for signed-out visitors', async () => {
    authMock.mockResolvedValue(null)
    featuredMock.mockResolvedValue([
      featuredPhoto({ id: 'p1', blobUrl: 'https://blob/feat-1.jpg' }),
    ])
    const html = await render()
    expect(featuredMock).not.toHaveBeenCalled()
    expect(html).not.toContain('https://blob/feat-1.jpg')
  })
})
