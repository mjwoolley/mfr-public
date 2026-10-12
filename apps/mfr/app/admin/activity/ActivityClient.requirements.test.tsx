// @vitest-environment happy-dom
// Requirements coverage for CAP-009 Site activity feed — the Activity tab UI
// (requirements/portal/site-activity-feed.md). fetch is stubbed with the
// /api/admin/activity response shape; the client and the real
// formatActivityMessage run for real. The API's ordering/page size/filters are
// covered in tests/reservations-integration/requirements-activity-feed.test.ts.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ActivityClient } from './ActivityClient'

const fetchMock = vi.fn()

function okJson(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

function ev(id: string, createdAt: string, from: string, to: string) {
  return {
    id,
    eventType: 'reservation_created',
    actorUserId: 'ann',
    metadata: { startDate: from, endDate: to },
    createdAt,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('CAP-009 · Newest activity first, 30 at a time', () => {
  it('shows each entry with its date and time, in the order served, and "Load more" fetches the next page', async () => {
    const newer = ev('e1', '2026-07-02T15:30:00.000Z', '2026-07-10', '2026-07-12')
    const older = ev('e2', '2026-07-01T09:00:00.000Z', '2026-08-01', '2026-08-03')
    const oldest = ev('e3', '2026-06-01T09:00:00.000Z', '2026-09-01', '2026-09-03')
    fetchMock
      .mockReturnValueOnce(
        okJson({ events: [newer, older], users: { ann: 'Ann' }, nextCursor: older.createdAt }),
      )
      .mockReturnValueOnce(okJson({ events: [oldest], users: { ann: 'Ann' }, nextCursor: null }))

    render(<ActivityClient />)

    const first = await screen.findByText('Ann booked 2026-07-10 → 2026-07-12.')
    const second = screen.getByText('Ann booked 2026-08-01 → 2026-08-03.')
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Each entry carries its date and time.
    expect(screen.getByText(new Date(newer.createdAt).toLocaleString())).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/activity')

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Ann booked 2026-09-01 → 2026-09-03.')
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/admin/activity?before=${encodeURIComponent(older.createdAt)}`,
    )
    // Last page: no more to load.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull())
  })
})

describe('CAP-009 · No activity yet', () => {
  it('shows "No activity yet." and no "Load more"', async () => {
    fetchMock.mockReturnValue(okJson({ events: [], users: {}, nextCursor: null }))
    render(<ActivityClient />)
    expect(await screen.findByText('No activity yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('does not show "No activity yet." when there is activity', async () => {
    fetchMock.mockReturnValue(
      okJson({
        events: [ev('e1', '2026-07-02T15:30:00.000Z', '2026-07-10', '2026-07-12')],
        users: { ann: 'Ann' },
        nextCursor: null,
      }),
    )
    render(<ActivityClient />)
    await screen.findByText('Ann booked 2026-07-10 → 2026-07-12.')
    expect(screen.queryByText('No activity yet.')).toBeNull()
  })
})

describe('CAP-009 · The feed fails to load', () => {
  it('shows "Failed to load activity."', async () => {
    // React Query retries a failed query 3 times with backoff in the browser;
    // fake timers skip the waits.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) } as Response)
    render(<ActivityClient />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(await screen.findByText('Failed to load activity.')).toBeTruthy()
  })
})
