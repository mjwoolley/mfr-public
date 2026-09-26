// @vitest-environment happy-dom
// Requirement tests for the Reservations summary page (CAP-028): the real
// SummaryClient against a faked /api/history, with "today" pinned to the
// CAP-028 Background date, July 12, 2027.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { SummaryClient } from './SummaryClient'
import type { SummaryReservation } from './summaryGrouping'
import { installFetch, renderWithQuery, pinToday } from '@/tests/reservations-ui/harness'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function row(over: Partial<SummaryReservation> & { id: string }): SummaryReservation {
  return {
    userId: 'carol',
    userName: 'Carol',
    startDate: '2027-08-01',
    endDate: '2027-08-06',
    status: 'confirmed',
    ...over,
  }
}

function setup(reservations: SummaryReservation[]) {
  pinToday('2027-07-12')
  installFetch({ 'GET /reservations/api/history': () => ({ body: { reservations } }) })
  renderWithQuery(<SummaryClient />)
}

describe('CAP-028 Reservations summary', () => {
  it('CAP-028 · Each person’s stays this year are grouped under their name', async () => {
    setup([
      row({
        id: 'd1',
        userId: 'dave',
        userName: 'Dave',
        startDate: '2027-08-01',
        endDate: '2027-08-03',
      }),
      row({
        id: 'c1',
        userId: 'carol',
        userName: 'Carol',
        startDate: '2027-05-01',
        endDate: '2027-05-04',
      }),
    ])
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reservations Summary' }),
    ).toBeTruthy()
    const sections = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(sections).toEqual(['Carol', 'Dave'])
    for (const section of document.querySelectorAll('section')) {
      const cols = Array.from(section.querySelectorAll('h3')).map((h) => h.textContent)
      expect(cols).toEqual(['Upcoming', 'Past'])
    }
  })

  it('CAP-028 · Each person’s nights are totalled ("5 upcoming · 3 past · 8 total nights")', async () => {
    setup([
      row({ id: 'may', startDate: '2027-05-01', endDate: '2027-05-04' }),
      row({ id: 'aug', startDate: '2027-08-01', endDate: '2027-08-06' }),
    ])
    const section = (await screen.findByRole('heading', { level: 2, name: 'Carol' })).closest(
      'section',
    )!
    expect(section.textContent).toContain('5 upcoming · 3 past · 8 total nights')
  })

  it('CAP-028 · A person with nothing in one column (Past shows "None")', async () => {
    setup([row({ id: 'aug', startDate: '2027-08-01', endDate: '2027-08-06' })])
    await screen.findByRole('heading', { level: 2, name: 'Carol' })
    const pastHeading = screen.getByRole('heading', { level: 3, name: 'Past' })
    expect(pastHeading.parentElement!.textContent).toBe('PastNone')
    const upcomingHeading = screen.getByRole('heading', { level: 3, name: 'Upcoming' })
    expect(upcomingHeading.parentElement!.textContent).toContain('Aug 1 → Aug 6')
  })

  it('CAP-028 · Nobody has stays this year', async () => {
    setup([])
    expect(await screen.findByText('No reservations yet.')).toBeTruthy()
  })

  it('CAP-028 · The summary fails to load', async () => {
    pinToday('2027-07-12')
    installFetch({ 'GET /reservations/api/history': () => ({ status: 500 }) })
    renderWithQuery(<SummaryClient />)
    expect(await screen.findByText('Failed to load reservation summary.')).toBeTruthy()
  })
})
