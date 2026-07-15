import { describe, expect, it, vi, beforeAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// next/image needs the Next.js runtime image config; render a plain img.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

vi.mock('@/lib/portal', () => ({
  getPortalSettings: vi.fn(async () => ({
    id: 'singleton',
    reunionYear: 2026,
    reunionStart: '2026-07-01',
    reunionEnd: '2026-07-05',
    highlightsUrl: 'https://photos.example/highlights',
    driveUrl: '',
    venmoUrl: 'https://venmo.com/u/Miller-Family-Lake',
    chatUrl: '',
    updatedAt: new Date(),
  })),
  getFundraising: vi.fn(async () => ({ year: 2026, raised: 7400, goal: 12000 })),
  getEvents: vi.fn(async () => []),
}))

import Home from './page'

describe('home page', () => {
  let html: string
  beforeAll(async () => {
    html = renderToStaticMarkup(await Home())
  })

  it('renders the reworked hero', () => {
    expect(html).toContain('Lake Lure, North Carolina')
    expect(html).toContain('Fifty summers')
  })

  it('shows the live fundraising goal card', () => {
    expect(html).toContain('2026 goal')
    expect(html).toContain('$7,400')
    expect(html).toContain('$12,000')
    expect(html).toContain('Venmo')
    expect(html).toContain('62% funded')
  })

  it('drops the old app cards and hero CTA buttons', () => {
    expect(html).not.toContain('Plan a stay')
    expect(html).not.toContain('Open Reservations')
    expect(html).not.toContain('Two things to do here')
  })
})
