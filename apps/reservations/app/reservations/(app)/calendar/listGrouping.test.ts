import { describe, it, expect } from 'vitest'
import { reservationsStartingInMonth } from './listGrouping'
import type { ReservationRow } from './useCalendarData'

function row(id: string, startDate: string, status: 'confirmed' | 'cancelled' = 'confirmed'): ReservationRow {
  return { id, userId: 'u1', startDate, endDate: startDate, status, userName: 'Jane' }
}

describe('reservationsStartingInMonth', () => {
  it('keeps only confirmed reservations that check in during the given month, sorted by start', () => {
    const rows = [
      row('july-late', '2026-07-20'),
      row('june', '2026-06-30'),
      row('july-early', '2026-07-03'),
      row('august', '2026-08-01'),
      row('july-cancelled', '2026-07-10', 'cancelled'),
    ]

    const result = reservationsStartingInMonth(rows, 2026, 6)

    expect(result.map((r) => r.id)).toEqual(['july-early', 'july-late'])
  })

  it('returns an empty list for a month with no check-ins', () => {
    expect(reservationsStartingInMonth([row('r1', '2026-07-03')], 2026, 4)).toEqual([])
  })

  it('does not confuse months across years', () => {
    const rows = [row('this-year', '2026-07-03'), row('next-year', '2027-07-03')]
    expect(reservationsStartingInMonth(rows, 2027, 6).map((r) => r.id)).toEqual(['next-year'])
  })
})
