// Requirements coverage (CAP-018 Photo history): the History page's
// explanation, its empty state, and that each event renders as its sentence.
// Rendered to static markup like app/page.test.tsx; the history read is mocked
// (its ordering / 100 limit is covered by the photos integration suite).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { requireApprovedMock, historyMock } = vi.hoisted(() => ({
  requireApprovedMock: vi.fn(),
  historyMock: vi.fn(),
}))
vi.mock('@/lib/authz', () => ({ requireApproved: requireApprovedMock }))
vi.mock('@/lib/photos/history', () => ({ getPhotoHistory: historyMock }))

import PhotoHistoryPage from './page'

const JANE = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  requireApprovedMock.mockResolvedValue({ user: { id: 'u1', roles: {} } })
})

async function render() {
  return renderToStaticMarkup(await PhotoHistoryPage())
}

describe('CAP-018 Photo history — History page', () => {
  it('CAP-018 · The page explains what it lists', async () => {
    historyMock.mockResolvedValue({ events: [], users: {} })
    expect(await render()).toContain('Who added, removed, captioned, or featured photos.')
  })

  it('CAP-018 · No photo changes yet', async () => {
    historyMock.mockResolvedValue({ events: [], users: {} })
    expect(await render()).toContain('Nothing yet — photo changes will show up here.')
  })

  it('CAP-018 · Each kind of photo change reads as a sentence — on the History page', async () => {
    historyMock.mockResolvedValue({
      events: [
        {
          id: 'e2',
          eventType: 'photo_featured',
          actorUserId: JANE,
          metadata: { year: 2026 },
          createdAt: '2026-08-02T12:00:00.000Z',
        },
        {
          id: 'e1',
          eventType: 'photo_uploaded',
          actorUserId: JANE,
          metadata: { year: 2026 },
          createdAt: '2026-08-01T12:00:00.000Z',
        },
      ],
      users: { [JANE]: 'Jane Miller' },
    })
    const html = await render()
    expect(html).not.toContain('Nothing yet')
    const featured = html.indexOf('Jane Miller featured a 2026 photo on the home page.')
    const added = html.indexOf('Jane Miller added a 2026 photo.')
    expect(featured).toBeGreaterThan(-1)
    expect(added).toBeGreaterThan(featured) // listed in the order given (newest first)
    // Timestamps are emitted as machine-readable times for the viewer's clock.
    expect(html).toContain('dateTime="2026-08-02T12:00:00.000Z"')
  })
})
