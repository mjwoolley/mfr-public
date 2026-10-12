// Requirements coverage for CAP-006 Home page (requirements/portal/home-page.md).
// Same seams as page.test.tsx: auth and the portal/photo data readers are
// mocked; the page itself renders for real.
//
// Deliberately NOT tested here (flagged by CAP-006 open questions):
// - a pending/blocked person seeing member content ([high]);
// - past events still listed ([medium]);
// - "Manage events"/"Add an event" shown to every member ([low]).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

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

const signedIn = { user: { id: 'u1', email: 'member@example.com', status: 'approved', roles: {} } }

function event(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    startDate: '2026-07-04',
    endDate: null,
    time: '',
    description: 'An event',
    meetingLink: null,
    ...over,
  }
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

describe('CAP-006 Home page', () => {
  it('CAP-006 · Signed-out visitors are invited to sign in instead of seeing member content', async () => {
    authMock.mockResolvedValue(null)
    const html = await render()
    expect(html).toContain('There’s more inside')
    expect(html).toContain(
      'Sign in to see this year’s goal, upcoming events, meals, photos and documents.',
    )
    expect(html).toMatch(/<a[^>]*href="\/sign-in"[^>]*>Sign in<\/a>/)
    expect(html).not.toContain('share goal')
    expect(html).not.toContain('Upcoming events')
  })

  describe('CAP-006 · Signed-in members see this year’s share goal', () => {
    beforeEach(() => authMock.mockResolvedValue(signedIn))

    it('shows shares sold "of" the goal in shares, with "Full ledger →" to Accounting', async () => {
      const html = await render()
      expect(html).toContain('FY2026 share goal')
      expect(html).toMatch(/7,400[\s\S]*of 12,000 shares/)
      expect(html).toMatch(/<a[^>]*href="\/accounting"[^>]*>Full ledger →<\/a>/)
    })

    it('offers "Venmo" to the family Venmo link when it is set', async () => {
      const html = await render()
      expect(html).toMatch(/<a[^>]*href="https:\/\/venmo.com\/u\/Miller-Family-Lake"[^>]*>/)
      expect(html).toContain('Venmo')
    })

    it('offers no "Venmo" button when the family Venmo link is unset', async () => {
      settingsMock.mockResolvedValue({ ...settings, venmoUrl: '' })
      const html = await render()
      expect(html).not.toContain('Venmo')
    })
  })

  it('CAP-006 · No goal set yet', async () => {
    authMock.mockResolvedValue(signedIn)
    fundraisingMock.mockResolvedValue({ year: 2026, raised: 0, goal: null })
    const html = await render()
    expect(html).toMatch(/>of (<!-- -->)?—<\/span>/)
    expect(html).toContain('Every share purchase keeps the cabin going.')
  })

  it('CAP-006 · The goal card disappears quietly when the figures can’t be read', async () => {
    authMock.mockResolvedValue(signedIn)
    // getFundraising degrades to null on any read error (portal.fundraising.test.ts).
    fundraisingMock.mockResolvedValue(null)
    const html = await render()
    // The page still renders the rest of the member content.
    expect(html).toContain('Lake Lure, North Carolina')
    expect(html).toContain('Upcoming events')
    expect(html).not.toContain('NaN')
  })

  describe('CAP-006 · Signed-in members see upcoming events in date order', () => {
    beforeEach(() => authMock.mockResolvedValue(signedIn))

    it('lists events in the start-date order getEvents returns them', async () => {
      eventsMock.mockResolvedValue([
        event({ id: 'a', startDate: '2026-07-01', description: 'First event' }),
        event({ id: 'b', startDate: '2026-07-03', description: 'Second event' }),
        event({ id: 'c', startDate: '2026-07-09', description: 'Third event' }),
      ])
      const html = await render()
      expect(html).toContain('Upcoming events')
      const first = html.indexOf('First event')
      const second = html.indexOf('Second event')
      const third = html.indexOf('Third event')
      expect(first).toBeGreaterThan(-1)
      expect(first).toBeLessThan(second)
      expect(second).toBeLessThan(third)
    })

    it('offers "Join" for an event with a call link', async () => {
      eventsMock.mockResolvedValue([
        event({ description: 'Family call', meetingLink: 'https://zoom.us/j/123' }),
      ])
      const html = await render()
      expect(html).toMatch(/<a[^>]*href="https:\/\/zoom.us\/j\/123"[^>]*target="_blank"[^>]*>/)
      expect(html).toMatch(/Join<\/a>/)
    })

    it('offers no "Join" for an event without a call link', async () => {
      eventsMock.mockResolvedValue([event({ description: 'Dock party' })])
      const html = await render()
      expect(html).not.toContain('Join')
    })
  })

  it('CAP-006 · Incomplete events still show', async () => {
    authMock.mockResolvedValue(signedIn)
    eventsMock.mockResolvedValue([
      event({ startDate: null, endDate: null, description: '', time: '' }),
    ])
    const html = await render()
    expect(html).toContain('Untitled event')
    expect(html).toContain('Date to be set')
  })

  it('CAP-006 · No events yet', async () => {
    authMock.mockResolvedValue(signedIn)
    eventsMock.mockResolvedValue([])
    const html = await render()
    expect(html).toContain('Nothing on the calendar yet.')
  })
})
