// @vitest-environment happy-dom
// Requirement tests for the cabin calendar page (CAP-020 Book a stay, CAP-021
// turnover wording, CAP-022 Cabin calendar, CAP-024 edit/cancel visibility):
// the real CalendarClient + BookingPanel + ReservationViewDialog, with the
// reservations API answered by an in-memory fake.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { CalendarClient } from './CalendarClient'
import { reservationTone } from './tones'
import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'
import {
  installFetch,
  renderWithQuery,
  calendarData,
  pinToday,
  stay,
  backgroundRules,
  type Routes,
} from '@/tests/reservations-ui/harness'

const OWN = reservationTone(true).fill
const FAMILY = reservationTone(false).fill

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(
  state: {
    reservations: ReservationRow[]
    blockedDates?: BlockedDateRow[]
    bookingRules?: BookingRulesRow | null
  },
  extra: Routes = {},
) {
  const fetchMock = installFetch({ ...calendarData(state), ...extra })
  const utils = renderWithQuery(<CalendarClient userId="me" isAdmin={false} />)
  return { fetchMock, ...utils }
}

async function goTo(monthLabel: string) {
  await screen.findByRole('heading', { level: 1 })
  for (let i = 0; i < 60; i++) {
    if (screen.getByRole('heading', { level: 1 }).textContent === monthLabel) return
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  }
  throw new Error(`never reached ${monthLabel}`)
}

/** The month-grid cell for a day of the displayed month. */
function day(n: number): HTMLButtonElement {
  const cells = Array.from(document.querySelectorAll<HTMLButtonElement>('button.daycell'))
  const cell = cells.find((c) => c.querySelector('span.text-sm')?.textContent === String(n))
  if (!cell) throw new Error(`no cell for day ${n}`)
  return cell
}

function dialog() {
  return within(screen.getByRole('dialog'))
}

function checkIn() {
  return document.getElementById('booking-check-in') as HTMLInputElement
}
function checkOut() {
  return document.getElementById('booking-check-out') as HTMLInputElement
}

describe('CAP-020 Book a stay', () => {
  it('CAP-020 · Two clicks on the calendar choose check-in and check-out', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    await goTo('July 2027')

    fireEvent.click(day(10))
    expect(screen.getByText('Check-in Jul 10 — now pick a check-out date')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(day(13))
    expect(dialog().getByText('New reservation')).toBeTruthy()
    expect(checkIn().value).toBe('2027-07-10')
    expect(checkOut().value).toBe('2027-07-13')
    expect(dialog().getByText('3 nights at the cabin')).toBeTruthy()
  })

  it('CAP-020 · Clicking the later day first still books forwards', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    await goTo('July 2027')

    fireEvent.click(day(13))
    fireEvent.click(day(10))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(checkIn().value).toBe('2027-07-10')
    expect(checkOut().value).toBe('2027-07-13')
  })

  it('CAP-020 · Clicking the check-in day again does not complete the selection', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    await goTo('July 2027')

    fireEvent.click(day(10))
    fireEvent.click(day(10))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Check-in Jul 10 — now pick a check-out date')).toBeTruthy()
  })

  it('CAP-020 · I can clear a half-made selection', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    await goTo('July 2027')

    fireEvent.click(day(10))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.queryByText(/now pick a check-out date/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    const hint = screen.getByText(/Pick a check-in date, then a check-out date/)
    expect(hint.textContent).toBe(
      'Pick a check-in date, then a check-out date to reserve the cabin — or hit New reservation.',
    )
  })

  it('CAP-020 · New reservation starts from today for two nights', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }))

    expect(checkIn().value).toBe('2027-03-10')
    expect(checkOut().value).toBe('2027-03-12')
  })

  it('CAP-020 · Check-out must be at least one day after check-in (earliest pick is Jul 11)', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    await goTo('July 2027')
    fireEvent.click(day(10))
    fireEvent.click(day(13))

    expect(checkOut().min).toBe('2027-07-11')
  })

  it.each([
    ['2027-07-11', '1 night at the cabin'],
    ['2027-07-17', '7 nights at the cabin'],
  ])(
    'CAP-020 · The dialog counts nights (Jul 10 → %s shows "%s")',
    async (checkOutDate, summary) => {
      pinToday('2027-03-10')
      setup({ reservations: [] })
      fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }))
      fireEvent.change(checkIn(), { target: { value: '2027-07-10' } })
      fireEvent.change(checkOut(), { target: { value: checkOutDate } })

      expect(dialog().getByText(summary)).toBeTruthy()
    },
  )

  it('CAP-020 · Confirming books the stay immediately (it appears on the calendar as my stay)', async () => {
    pinToday('2027-03-10')
    const state = { reservations: [] as ReservationRow[] }
    const posts: unknown[] = []
    setup(state, {
      'POST /reservations/api/reservations': ({ body }) => {
        posts.push(body)
        const b = body as { startDate: string; endDate: string }
        state.reservations.push(stay({ id: 'new', userId: 'me', userName: 'Me Member', ...b }))
        return { status: 201, body: { reservation: { id: 'new', status: 'confirmed' } } }
      },
    })
    await goTo('July 2027')
    fireEvent.click(day(10))
    fireEvent.click(day(13))
    fireEvent.click(dialog().getByRole('button', { name: 'Confirm reservation' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts).toEqual([{ startDate: '2027-07-10', endDate: '2027-07-13' }])
    await waitFor(() => expect(day(10).style.background).toBe(OWN))
    expect(day(11).style.background).toBe(OWN)
    expect(day(12).style.background).toBe(OWN)
    expect(day(10).textContent).toContain('Me Member')
  })

  it('CAP-020 · Someone else takes the dates while I am deciding (told, and can retry in the same dialog)', async () => {
    pinToday('2027-03-10')
    const posts: { startDate: string; endDate: string }[] = []
    setup(
      { reservations: [] },
      {
        'POST /reservations/api/reservations': ({ body }) => {
          const b = body as { startDate: string; endDate: string }
          posts.push(b)
          // First attempt: another member's stay was committed meanwhile.
          if (posts.length === 1) {
            return {
              status: 400,
              body: {
                error: 'Those dates overlap an existing reservation.',
                code: 'OVERLAP_BOOKED',
              },
            }
          }
          return { status: 201, body: { reservation: { id: 'r2' } } }
        },
      },
    )
    await goTo('July 2027')
    fireEvent.click(day(10))
    fireEvent.click(day(13))
    fireEvent.click(dialog().getByRole('button', { name: 'Confirm reservation' }))

    expect(await dialog().findByText('Those dates overlap an existing reservation.')).toBeTruthy()
    // Same dialog stays open with editable dates.
    fireEvent.change(checkIn(), { target: { value: '2027-07-20' } })
    fireEvent.change(checkOut(), { target: { value: '2027-07-22' } })
    const confirm = dialog().getByRole('button', { name: 'Confirm reservation' })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts[1]).toEqual({ startDate: '2027-07-20', endDate: '2027-07-22' })
  })

  it('CAP-020 · The calendar cannot be used before booking rules exist', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [], bookingRules: null })

    const msg = await screen.findByText(/The calendar isn.t set up yet/)
    expect(msg.textContent).toBe(
      'The calendar isn’t set up yet — an admin needs to configure booking rules under Admin → Booking Rules.',
    )
    expect(screen.queryByRole('button', { name: 'New reservation' })).toBeNull()
    expect(document.querySelectorAll('button.daycell')).toHaveLength(0)
  })
})

describe('CAP-021 Booking limits — turnover wording in the booking dialog', () => {
  it.each([
    ['2027-07-13', '2027-07-15', 'Your check-in is the same day another stay checks out.'],
    ['2027-07-07', '2027-07-10', 'Your check-out is the same day another stay checks in.'],
  ])(
    'CAP-021 · Same-day turnover with another member is allowed but flagged (%s → %s)',
    async (start, end, warning) => {
      pinToday('2027-03-10')
      setup({
        reservations: [
          stay({
            id: 'carol-1',
            userId: 'carol',
            userName: 'Carol',
            startDate: '2027-07-10',
            endDate: '2027-07-13',
          }),
        ],
      })
      fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }))
      fireEvent.change(checkIn(), { target: { value: start } })
      fireEvent.change(checkOut(), { target: { value: end } })

      expect(
        dialog().getByText(
          `⚠ ${warning} You can still book it — coordinate arrival and departure with Carol.`,
        ),
      ).toBeTruthy()
      const confirm = dialog().getByRole('button', { name: 'Confirm reservation' })
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
    },
  )
})

describe('CAP-022 Cabin calendar', () => {
  it('CAP-022 · Reservations open on the calendar for the current month', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('March 2027')
  })

  it('CAP-022 · I can move between months (March → April → March)', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    const h1 = await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(h1.textContent).toBe('April 2027')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(h1.textContent).toBe('March 2027')
  })

  it('CAP-022 · The legend explains the colors', async () => {
    pinToday('2027-03-10')
    setup({ reservations: [] })
    await screen.findByRole('heading', { level: 1 })
    for (const label of ['Available', 'Your stay', 'Booked by family', 'Turnover day']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('CAP-022 · My stays and family stays look different', async () => {
    pinToday('2027-03-10')
    setup({
      reservations: [
        stay({ id: 'mine', userId: 'me', startDate: '2027-07-10', endDate: '2027-07-13' }),
        stay({
          id: 'carol',
          userId: 'carol',
          userName: 'Carol',
          startDate: '2027-07-20',
          endDate: '2027-07-22',
        }),
      ],
    })
    await goTo('July 2027')

    for (const d of [10, 11, 12, 13]) expect(day(d).style.background).toBe(OWN)
    for (const d of [20, 21, 22]) expect(day(d).style.background).toBe(FAMILY)
    expect(day(20).textContent).toContain('Carol')
    expect(OWN).not.toBe(FAMILY)
  })

  it('CAP-022 · A turnover day shows both stays (split between departure and arrival)', async () => {
    pinToday('2027-03-10')
    setup({
      reservations: [
        stay({
          id: 'carol',
          userId: 'carol',
          userName: 'Carol',
          startDate: '2027-07-10',
          endDate: '2027-07-13',
        }),
        stay({ id: 'mine', userId: 'me', startDate: '2027-07-13', endDate: '2027-07-15' }),
      ],
    })
    await goTo('July 2027')

    const bg = day(13).style.background
    expect(bg).toContain('linear-gradient')
    // Departing (Carol, family) half first, arriving (me) half second.
    expect(bg.indexOf(FAMILY)).toBeGreaterThanOrEqual(0)
    expect(bg.indexOf(OWN)).toBeGreaterThan(bg.indexOf(FAMILY))
  })

  it('CAP-022 · A check-out-only day can be picked as a check-in', async () => {
    pinToday('2027-03-10')
    setup({
      reservations: [
        stay({
          id: 'carol',
          userId: 'carol',
          userName: 'Carol',
          startDate: '2027-07-10',
          endDate: '2027-07-13',
        }),
      ],
    })
    await goTo('July 2027')

    expect(day(13).disabled).toBe(false)
    fireEvent.click(day(13))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Check-in Jul 13 — now pick a check-out date')).toBeTruthy()
  })

  it('CAP-022 · Blocked days cannot be picked (greyed and labelled "Blocked")', async () => {
    pinToday('2027-03-10')
    setup({
      reservations: [],
      // The nights of Aug 10–12 (half-open storage, checkout-style end).
      blockedDates: [{ id: 'b1', startDate: '2027-08-10', endDate: '2027-08-13', reason: null }],
    })
    await goTo('August 2027')

    for (const d of [10, 11, 12]) {
      expect(day(d).disabled).toBe(true)
      expect(day(d).style.background).toContain('var(--color-neutral-200)')
      expect(day(d).textContent).toContain('Blocked')
    }
    fireEvent.click(day(11))
    expect(screen.queryByText(/now pick a check-out date/)).toBeNull()
  })

  it('CAP-022 · Days after the booking horizon cannot be picked', async () => {
    pinToday('2031-01-05')
    setup({
      reservations: [],
      bookingRules: { ...backgroundRules, bookingHorizonDate: '2030-12-31' },
    })
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('January 2031')

    const cells = Array.from(document.querySelectorAll<HTMLButtonElement>('button.daycell'))
    expect(cells).toHaveLength(31)
    for (const c of cells) {
      expect(c.disabled).toBe(true)
      expect(c.style.background).toContain('var(--color-neutral-200)')
    }
  })

  it.each([
    ['I', 'me', 'Your stay', ['Cancel reservation', 'Edit', 'Close']],
    ['Carol', 'carol', 'Family', ['Close']],
  ] as const)(
    'CAP-022 · Opening a booked night shows the stay (owner: %s)',
    async (_owner, userId, tag, actions) => {
      pinToday('2027-03-10')
      setup({
        reservations: [
          stay({
            id: 'r1',
            userId,
            userName: userId === 'me' ? 'Me Member' : 'Carol',
            startDate: '2027-07-10',
            endDate: '2027-07-13',
          }),
        ],
      })
      await goTo('July 2027')
      fireEvent.click(day(11))

      const d = dialog()
      expect(d.getByText('Jul 10 → Jul 13')).toBeTruthy()
      expect(d.getByText('3 nights')).toBeTruthy()
      expect(d.getByText(tag)).toBeTruthy()
      // The dialog's own × button is also labelled "Close"; ignore it.
      const offered = d
        .getAllByRole('button')
        .filter((b) => b.textContent?.trim())
        .map((b) => b.textContent!.trim())
      expect(offered).toEqual([...actions])
    },
  )

  it('CAP-022 · List view when nobody checks in that month', async () => {
    pinToday('2027-03-10')
    setup({
      reservations: [stay({ id: 'june', startDate: '2027-06-30', endDate: '2027-07-03' })],
    })
    await goTo('July 2027')
    fireEvent.click(screen.getByLabelText('List'))

    expect(
      screen.getByText(
        'The cabin is wide open this month. Switch to Month view and pick your dates.',
      ),
    ).toBeTruthy()
  })

  it('CAP-022 · Calendar that fails to load', async () => {
    pinToday('2027-03-10')
    installFetch({
      ...calendarData({ reservations: [] }),
      'GET /reservations/api/reservations': () => ({ status: 500, body: { error: 'boom' } }),
    })
    renderWithQuery(<CalendarClient userId="me" isAdmin={false} />)

    expect(await screen.findByText('Failed to load the calendar. Please refresh.')).toBeTruthy()
  })

  it('CAP-022 · The calendar picks up other people’s changes when I come back to it', async () => {
    pinToday('2027-03-10')
    const state = { reservations: [] as ReservationRow[] }
    setup(state)
    await goTo('July 2027')
    expect(day(20).textContent).not.toContain('Carol')

    state.reservations.push(
      stay({
        id: 'carol',
        userId: 'carol',
        userName: 'Carol',
        startDate: '2027-07-20',
        endDate: '2027-07-22',
      }),
    )
    // Returning to the browser tab (React Query's focus manager listens for it).
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(day(20).textContent).toContain('Carol'))
  })
})

describe('CAP-024 Change or cancel a reservation — on the calendar', () => {
  it('CAP-024 · Other members cannot change or cancel my stay (they are not offered Edit or Cancel reservation)', async () => {
    pinToday('2027-03-10')
    // Viewing as "carol"; the stay belongs to "me".
    installFetch(
      calendarData({
        reservations: [
          stay({ id: 'mine', userId: 'me', startDate: '2027-07-10', endDate: '2027-07-13' }),
        ],
      }),
    )
    renderWithQuery(<CalendarClient userId="carol" isAdmin={false} />)
    await goTo('July 2027')
    fireEvent.click(day(10))

    const d = dialog()
    expect(d.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(d.queryByRole('button', { name: 'Cancel reservation' })).toBeNull()
  })
})
