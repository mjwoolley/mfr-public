// @vitest-environment happy-dom
// Requirement tests for My reservations (CAP-023) and the owner's edit flow
// from it (CAP-024): the real MyReservationsClient and its dialogs, with the
// reservations API answered by an in-memory fake. "Today" is pinned to the
// CAP-023 Background date, March 10, 2027.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MyReservationsClient } from './MyReservationsClient'
import type { ReservationRow } from '../calendar/useCalendarData'
import {
  installFetch,
  renderWithQuery,
  calendarData,
  pinToday,
  stay,
  type Routes,
} from '@/tests/reservations-ui/harness'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(reservations: ReservationRow[], extra: Routes = {}) {
  pinToday('2027-03-10')
  const fetchMock = installFetch({ ...calendarData({ reservations }), ...extra })
  renderWithQuery(<MyReservationsClient userId="me" isAdmin={false} />)
  return { fetchMock }
}

function rowFor(range: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('.rowcard')).find((r) =>
    r.textContent?.includes(range),
  )
  if (!row) throw new Error(`no row for ${range}`)
  return row
}

describe('CAP-023 My reservations', () => {
  it('CAP-023 · My stays that have not ended are listed soonest first', async () => {
    setup([
      stay({ id: 'jul', startDate: '2027-07-10', endDate: '2027-07-13' }),
      stay({ id: 'apr', startDate: '2027-04-02', endDate: '2027-04-04' }),
    ])
    expect(await screen.findByRole('heading', { name: 'My reservations' })).toBeTruthy()

    const rows = Array.from(document.querySelectorAll('.rowcard')).map((r) => r.textContent)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('Apr 2 → Apr 4')
    expect(rows[0]).toContain('2 nights')
    expect(rows[1]).toContain('Jul 10 → Jul 13')
    expect(rows[1]).toContain('3 nights')
  })

  it.each([
    ['2027-03-08', '2027-03-12', 'In progress'],
    ['2027-03-10', '2027-03-12', 'In progress'],
    ['2027-03-11', '2027-03-13', 'Upcoming'],
  ])(
    'CAP-023 · Each stay is marked in progress or upcoming (%s → %s is "%s")',
    async (start, end, tag) => {
      setup([stay({ id: 'r', startDate: start, endDate: end })])
      await screen.findByRole('heading', { name: 'My reservations' })
      const tagEl = document.querySelector('.rowcard span.tag')
      expect(tagEl?.textContent).toBe(tag)
    },
  )

  it('CAP-023 · Only my current and future confirmed stays are listed', async () => {
    setup([
      // Checked out today (March 10) — over.
      stay({ id: 'ended', startDate: '2027-03-07', endDate: '2027-03-10' }),
      stay({
        id: 'cancelled',
        startDate: '2027-07-01',
        endDate: '2027-07-04',
        status: 'cancelled',
      }),
      stay({
        id: 'other',
        userId: 'carol',
        userName: 'Carol',
        startDate: '2027-05-01',
        endDate: '2027-05-03',
      }),
    ])
    expect(
      await screen.findByText(
        'No reservations yet. Pick your dates on the calendar to book the cabin.',
      ),
    ).toBeTruthy()
    expect(document.querySelectorAll('.rowcard')).toHaveLength(0)
  })

  it('CAP-023 · No current or upcoming stays shows the full empty message', async () => {
    setup([])
    expect(
      await screen.findByText(
        'No reservations yet. Pick your dates on the calendar to book the cabin.',
      ),
    ).toBeTruthy()
  })

  it('CAP-023 · I can book from My reservations (dialog opens Mar 10 → Mar 12)', async () => {
    setup([])
    fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }))
    const d = within(screen.getByRole('dialog'))
    expect(d.getByText('New reservation')).toBeTruthy()
    expect((document.getElementById('booking-check-in') as HTMLInputElement).value).toBe(
      '2027-03-10',
    )
    expect((document.getElementById('booking-check-out') as HTMLInputElement).value).toBe(
      '2027-03-12',
    )
  })

  it('CAP-023 · I can open, change or cancel a listed stay', async () => {
    setup([stay({ id: 'jul', startDate: '2027-07-10', endDate: '2027-07-13' })])
    await screen.findByRole('heading', { name: 'My reservations' })
    const row = within(rowFor('Jul 10 → Jul 13'))
    expect(row.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(row.getByRole('button', { name: 'Cancel' })).toBeTruthy()

    // Pressing the stay itself shows its details.
    fireEvent.click(row.getByRole('button', { name: /Jul 10 → Jul 13/ }))
    const d = within(screen.getByRole('dialog'))
    expect(d.getByText('Reservation')).toBeTruthy()
    expect(d.getByText('Jul 10 → Jul 13')).toBeTruthy()
    expect(d.getByText('3 nights')).toBeTruthy()
  })

  it('CAP-023 · The list fails to load', async () => {
    pinToday('2027-03-10')
    installFetch({
      ...calendarData({ reservations: [] }),
      'GET /reservations/api/reservations': () => ({ status: 500 }),
    })
    renderWithQuery(<MyReservationsClient userId="me" isAdmin={false} />)
    expect(await screen.findByText('Failed to load your reservations.')).toBeTruthy()
  })
})

describe('CAP-024 Change or cancel a reservation — from My reservations', () => {
  const mine = stay({ id: 'mine', startDate: '2027-07-10', endDate: '2027-07-13' })

  it('CAP-024 · The edit dialog starts from my current dates', async () => {
    setup([mine])
    await screen.findByRole('heading', { name: 'My reservations' })
    fireEvent.click(within(rowFor('Jul 10 → Jul 13')).getByRole('button', { name: 'Edit' }))

    const d = within(screen.getByRole('dialog'))
    expect(d.getByText('Edit reservation')).toBeTruthy()
    expect((document.getElementById('booking-check-in') as HTMLInputElement).value).toBe(
      '2027-07-10',
    )
    expect((document.getElementById('booking-check-out') as HTMLInputElement).value).toBe(
      '2027-07-13',
    )
  })

  it('CAP-024 · New dates must still meet the booking limits (overlap shown, Save changes disabled)', async () => {
    setup([
      mine,
      stay({
        id: 'carol',
        userId: 'carol',
        userName: 'Carol',
        startDate: '2027-07-14',
        endDate: '2027-07-16',
      }),
    ])
    await screen.findByRole('heading', { name: 'My reservations' })
    fireEvent.click(within(rowFor('Jul 10 → Jul 13')).getByRole('button', { name: 'Edit' }))
    fireEvent.change(document.getElementById('booking-check-out')!, {
      target: { value: '2027-07-15' },
    })

    const d = within(screen.getByRole('dialog'))
    expect(d.getByText('Those dates overlap an existing reservation.')).toBeTruthy()
    expect((d.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('CAP-024 · Someone takes the new dates first (the race message is shown)', async () => {
    const patches: unknown[] = []
    setup([mine], {
      'PATCH /reservations/api/reservations/:id': ({ body }) => {
        patches.push(body)
        return {
          status: 409,
          body: {
            error:
              'Those dates were just booked or blocked by someone else. Please pick different dates.',
          },
        }
      },
    })
    await screen.findByRole('heading', { name: 'My reservations' })
    fireEvent.click(within(rowFor('Jul 10 → Jul 13')).getByRole('button', { name: 'Edit' }))
    fireEvent.change(document.getElementById('booking-check-out')!, {
      target: { value: '2027-07-15' },
    })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }),
    )

    expect(
      await within(screen.getByRole('dialog')).findByText(
        'Those dates were just booked or blocked by someone else. Please pick different dates.',
      ),
    ).toBeTruthy()
    expect(patches).toEqual([{ startDate: '2027-07-10', endDate: '2027-07-15' }])
    // The listed stay still shows its old dates.
    expect(rowFor('Jul 10 → Jul 13')).toBeTruthy()
  })

  it('CAP-024 · I cancel my stay (it no longer appears on My reservations)', async () => {
    const reservations = [mine]
    setup(reservations, {
      'DELETE /reservations/api/reservations/:id': () => {
        reservations.splice(0, 1)
        return { body: { reservation: { ...mine, status: 'cancelled' } } }
      },
    })
    await screen.findByRole('heading', { name: 'My reservations' })
    fireEvent.click(within(rowFor('Jul 10 → Jul 13')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(document.querySelectorAll('.rowcard')).toHaveLength(0))
  })
})
