import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// next/image needs the Next.js runtime image config; render a plain img.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

// Hoisted so the vi.mock factories (which run before the file body) can use them.
const { authMock, settingsMock, fundraisingMock, eventsMock, highlightsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  settingsMock: vi.fn(),
  fundraisingMock: vi.fn(),
  eventsMock: vi.fn(),
  highlightsMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/portal', () => ({
  getPortalSettings: settingsMock,
  getFundraising: fundraisingMock,
  getEvents: eventsMock,
}))
vi.mock('@/lib/photos/slides', () => ({ getHighlightSlides: highlightsMock }))

import Home from './page'

const settings = {
  id: 'singleton',
  reunionYear: 2026,
  reunionStart: '2026-07-01',
  reunionEnd: '2026-07-05',
  highlightsUrl: 'https://photos.example/highlights',
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
  highlightsMock.mockResolvedValue([])
})

describe('home page — hero slideshow source', () => {
  it('falls back to the static image when no highlight slides exist', async () => {
    authMock.mockResolvedValue(null)
    highlightsMock.mockResolvedValue([])
    const html = await render()
    expect(html).toContain('/lake-house.jpg')
  })

  it('rotates through uploaded highlight slides when present', async () => {
    authMock.mockResolvedValue(null)
    highlightsMock.mockResolvedValue([
      { id: 's1', blobUrl: 'https://blob/hi-1.jpg' },
      { id: 's2', blobUrl: 'https://blob/hi-2.jpg' },
    ])
    const html = await render()
    expect(html).toContain('https://blob/hi-1.jpg')
    expect(html).toContain('https://blob/hi-2.jpg')
    expect(html).not.toContain('/lake-house.jpg')
  })
})

describe('home page — hero (always shown)', () => {
  it('renders the reworked hero for signed-out visitors', async () => {
    authMock.mockResolvedValue(null)
    const html = await render()
    expect(html).toContain('Lake Lure, North Carolina')
    expect(html).toContain('Fifty summers')
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
