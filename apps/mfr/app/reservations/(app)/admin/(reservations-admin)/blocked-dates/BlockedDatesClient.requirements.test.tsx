// @vitest-environment happy-dom
// Requirement tests for the admin Blocked Dates screen (CAP-026): the real
// BlockedDatesClient with the blocked-dates API answered by an in-memory
// fake. Server-side rules (end after start, overlap refusal, admin-only) are
// covered route-level in tests/reservations-integration/requirements-admin.test.ts.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { BlockedDatesClient } from './BlockedDatesClient'
import type { BlockedDateRow } from '../../../calendar/useCalendarData'
import { installFetch, renderWithQuery, type Routes } from '@/tests/reservations-ui/harness'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(blocked: BlockedDateRow[], extra: Routes = {}) {
  const posts: unknown[] = []
  installFetch({
    'GET /reservations/api/blocked-dates': () => ({ body: { blockedDates: blocked } }),
    'POST /reservations/api/admin/blocked-dates': ({ body }) => {
      posts.push(body)
      const b = body as { startDate: string; endDate: string; reason?: string }
      blocked.push({ id: `b${blocked.length}`, reason: b.reason ?? null, ...b })
      return { status: 201, body: { blockedDate: {} } }
    },
    ...extra,
  })
  renderWithQuery(<BlockedDatesClient />)
  return { posts }
}

function fill(start: string, end: string, reason?: string) {
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: end } })
  if (reason !== undefined) {
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: reason } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Block these dates' }))
}

describe('CAP-026 Blocked dates', () => {
  it('CAP-026 · The page explains what blocking does', async () => {
    setup([])
    expect(
      screen.getByText("Block off dates the cabin is unavailable — these can't be booked."),
    ).toBeTruthy()
    expect(screen.getByLabelText('Start date')).toBeTruthy()
    expect(screen.getByLabelText('End date')).toBeTruthy()
    expect(screen.getByLabelText('Reason (optional)')).toBeTruthy()
  })

  it('CAP-026 · I block a period with a reason (listed, form cleared)', async () => {
    const { posts } = setup([])
    fill('2027-10-01', '2027-10-10', 'Dock maintenance')

    const range = await screen.findByText('Oct 1 → Oct 10')
    expect(range.parentElement!.textContent).toContain('Dock maintenance')
    expect(posts).toEqual([
      { startDate: '2027-10-01', endDate: '2027-10-10', reason: 'Dock maintenance' },
    ])
    await waitFor(() =>
      expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe(''),
    )
    expect((screen.getByLabelText('End date') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Reason (optional)') as HTMLInputElement).value).toBe('')
  })

  it('CAP-026 · A reason is optional (saved and listed without a reason)', async () => {
    const { posts } = setup([])
    fill('2027-10-01', '2027-10-10')

    const range = await screen.findByText('Oct 1 → Oct 10')
    expect(posts).toEqual([{ startDate: '2027-10-01', endDate: '2027-10-10' }])
    expect(range.parentElement!.textContent).toBe('Oct 1 → Oct 10')
  })

  it.each(['2027-10-10', '2027-10-09'])(
    'CAP-026 · The end date must be after the start date (Oct 10 → %s shows the error, nothing listed)',
    async (end) => {
      setup([], {
        'POST /reservations/api/admin/blocked-dates': () => ({
          status: 400,
          body: { error: 'endDate must be after startDate' },
        }),
      })
      fill('2027-10-10', end)

      expect(await screen.findByText('endDate must be after startDate')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    },
  )

  it('CAP-026 · I cannot block dates someone has already booked (overlap message shown)', async () => {
    setup([], {
      'POST /reservations/api/admin/blocked-dates': () => ({
        status: 409,
        body: { error: 'Those dates overlap an existing reservation.' },
      }),
    })
    fill('2027-10-01', '2027-10-10')

    expect(await screen.findByText('Those dates overlap an existing reservation.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('CAP-026 · The list fails to load', async () => {
    installFetch({ 'GET /reservations/api/blocked-dates': () => ({ status: 500 }) })
    renderWithQuery(<BlockedDatesClient />)
    expect(await screen.findByText('Failed to load blocked dates.')).toBeTruthy()
  })
})
