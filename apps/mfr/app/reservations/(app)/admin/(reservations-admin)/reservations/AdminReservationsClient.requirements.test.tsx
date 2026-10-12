// @vitest-environment happy-dom
// Requirement tests for the admin All Reservations screen (CAP-025): the real
// AdminReservationsClient and BookingPanel, with the reservations API
// answered by an in-memory fake. "Today" is pinned to March 10, 2027.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { AdminReservationsClient } from './AdminReservationsClient'
import type { ReservationRow } from '../../../calendar/useCalendarData'
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

const members = [
  { id: 'carol', name: 'Carol' },
  { id: 'dave', name: 'Dave' },
  { id: 'nameless', name: null },
]

function setup(reservations: ReservationRow[], extra: Routes = {}) {
  pinToday('2027-03-10')
  const fetchMock = installFetch({ ...calendarData({ reservations }), ...extra })
  renderWithQuery(<AdminReservationsClient adminUserId="admin" members={members} />)
  return { fetchMock }
}

const intro = 'View, edit, cancel, or create a reservation for any family member.'

function rowFor(range: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('.rowcard')).find((r) =>
    r.textContent?.includes(range),
  )
  if (!row) throw new Error(`no row for ${range}`)
  return row
}

const carolStay = stay({
  id: 'carol-jul',
  userId: 'carol',
  userName: 'Carol',
  startDate: '2027-07-10',
  endDate: '2027-07-13',
})

describe('CAP-025 Manage all reservations', () => {
  it('CAP-025 · All confirmed stays are listed in date order', async () => {
    setup([
      carolStay,
      stay({
        id: 'dave-may',
        userId: 'dave',
        userName: 'Dave',
        startDate: '2027-05-01',
        endDate: '2027-05-03',
      }),
    ])
    expect(await screen.findByText(intro)).toBeTruthy()
    const rows = Array.from(document.querySelectorAll('.rowcard')).map((r) => r.textContent ?? '')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('May 1 → May 3')
    expect(rows[0]).toContain('Dave · 2 nights')
    expect(rows[1]).toContain('Jul 10 → Jul 13')
    expect(rows[1]).toContain('Carol · 3 nights')
  })

  it('CAP-025 · No stays to list', async () => {
    setup([])
    expect(await screen.findByText('No reservations in range.')).toBeTruthy()
  })

  it('CAP-025 · I must choose a member when booking on someone’s behalf', async () => {
    setup([])
    fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }))
    const d = within(screen.getByRole('dialog'))

    expect((document.getElementById('booking-check-in') as HTMLInputElement).value).toBe(
      '2027-03-10',
    )
    expect((document.getElementById('booking-check-out') as HTMLInputElement).value).toBe(
      '2027-03-11',
    )
    const picker = d.getByLabelText('Member') as HTMLSelectElement
    expect(picker.options[0].textContent).toBe('Select a member…')
    expect(picker.value).toBe('')
    expect(d.getByText('Choose a member to book for.')).toBeTruthy()
    const confirm = d.getByRole('button', { name: 'Confirm reservation' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.change(picker, { target: { value: 'carol' } })
    expect(d.queryByText('Choose a member to book for.')).toBeNull()
    expect(confirm.disabled).toBe(false)
  })

  it('CAP-025 · Only approved members can be chosen (listed by name, unnamed as "Unnamed member")', async () => {
    setup([])
    fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }))
    const picker = within(screen.getByRole('dialog')).getByLabelText('Member') as HTMLSelectElement
    const labels = Array.from(picker.options).map((o) => o.textContent)
    expect(labels).toEqual(['Select a member…', 'Carol', 'Dave', 'Unnamed member'])
  })

  it('CAP-025 · A booking made for a member belongs to that member (submitted as their stay)', async () => {
    const posts: unknown[] = []
    setup([], {
      'POST /reservations/api/reservations': ({ body }) => {
        posts.push(body)
        return { status: 201, body: { reservation: { id: 'x' } } }
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }))
    const d = within(screen.getByRole('dialog'))
    fireEvent.change(d.getByLabelText('Member'), { target: { value: 'carol' } })
    fireEvent.change(document.getElementById('booking-check-in')!, {
      target: { value: '2027-07-10' },
    })
    fireEvent.change(document.getElementById('booking-check-out')!, {
      target: { value: '2027-07-13' },
    })
    fireEvent.click(d.getByRole('button', { name: 'Confirm reservation' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts).toEqual([{ startDate: '2027-07-10', endDate: '2027-07-13', userId: 'carol' }])
  })

  it('CAP-025 · I change a member’s stay (new dates are checked against Carol’s yearly limit)', async () => {
    // Carol already has 55 other nights in 2027 (14+14+14+13); the admin has none.
    const carolOthers = [
      ['2027-01-01', '2027-01-15'],
      ['2027-02-01', '2027-02-15'],
      ['2027-03-01', '2027-03-15'],
      ['2027-04-01', '2027-04-14'],
    ].map(([s, e], i) =>
      stay({ id: `c${i}`, userId: 'carol', userName: 'Carol', startDate: s, endDate: e }),
    )
    setup([...carolOthers, carolStay])
    await screen.findByText(intro)
    fireEvent.click(within(rowFor('Jul 10 → Jul 13')).getByRole('button', { name: 'Edit' }))
    const d = within(screen.getByRole('dialog'))
    expect(d.getByText('Edit reservation')).toBeTruthy()

    // 3 → 5 nights keeps Carol at 60: allowed.
    fireEvent.change(document.getElementById('booking-check-out')!, {
      target: { value: '2027-07-15' },
    })
    expect((d.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    // 3 → 6 nights takes Carol to 61: refused on HER limit.
    fireEvent.change(document.getElementById('booking-check-out')!, {
      target: { value: '2027-07-16' },
    })
    expect(d.getByText('This would exceed your 60-night limit for 2027.')).toBeTruthy()
    expect((d.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('CAP-025 · I cancel a member’s stay (it disappears from the list)', async () => {
    const reservations = [carolStay]
    const deleted: string[] = []
    setup(reservations, {
      'DELETE /reservations/api/reservations/:id': ({ path }) => {
        deleted.push(path)
        reservations.splice(0, 1)
        return { body: { reservation: { ...carolStay, status: 'cancelled' } } }
      },
    })
    await screen.findByText(intro)
    fireEvent.click(within(rowFor('Jul 10 → Jul 13')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.getByText('No reservations in range.')).toBeTruthy())
    expect(deleted).toEqual(['/reservations/api/reservations/carol-jul'])
  })

  it('CAP-025 · A failed cancellation is shown on that stay', async () => {
    setup(
      [
        carolStay,
        stay({
          id: 'dave-may',
          userId: 'dave',
          userName: 'Dave',
          startDate: '2027-05-01',
          endDate: '2027-05-03',
        }),
      ],
      {
        'DELETE /reservations/api/reservations/:id': () => ({
          status: 500,
          body: { error: 'Could not cancel right now.' },
        }),
      },
    )
    await screen.findByText(intro)
    fireEvent.click(within(rowFor('Jul 10 → Jul 13')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(rowFor('Jul 10 → Jul 13').textContent).toContain('Could not cancel right now.'),
    )
    expect(rowFor('May 1 → May 3').textContent).not.toContain('Could not cancel right now.')
    expect(document.querySelectorAll('.rowcard')).toHaveLength(2)
  })
})
