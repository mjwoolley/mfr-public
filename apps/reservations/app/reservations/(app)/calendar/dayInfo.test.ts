import { describe, it, expect } from 'vitest'
import { computeDayInfo } from './dayInfo'
import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

const rules: BookingRulesRow = {
  id: 1,
  bookingHorizonDate: '2027-12-31',
  maxConsecutiveNights: 7,
  maxNightsPerUserPerYear: 14,
}

describe('computeDayInfo', () => {
  it('reports an unbooked, unblocked, in-range day as fully open', () => {
    const info = computeDayInfo('2027-06-15', [], [], rules)
    expect(info).toEqual({
      reservationId: null,
      bookedByName: null,
      bookedByUserId: null,
      isReservationStart: false,
      isBlocked: false,
      isPastHorizon: false,
    })
  })

  it('reports the booker name and user id for a day covered by a confirmed reservation', () => {
    const reservations: ReservationRow[] = [
      { id: 'r1', userId: 'u1', startDate: '2027-06-10', endDate: '2027-06-15', status: 'confirmed', userName: 'Jane' },
    ]
    const info = computeDayInfo('2027-06-12', reservations, [], rules)
    expect(info.bookedByName).toBe('Jane')
    expect(info.bookedByUserId).toBe('u1')
    expect(info.reservationId).toBe('r1')
  })

  it('flags only the check-in day as the reservation start', () => {
    const reservations: ReservationRow[] = [
      { id: 'r1', userId: 'u1', startDate: '2027-06-10', endDate: '2027-06-15', status: 'confirmed', userName: 'Jane' },
    ]
    expect(computeDayInfo('2027-06-10', reservations, [], rules).isReservationStart).toBe(true)
    expect(computeDayInfo('2027-06-11', reservations, [], rules).isReservationStart).toBe(false)
  })

  it('does not report a booking for the half-open end date itself', () => {
    const reservations: ReservationRow[] = [
      { id: 'r1', userId: 'u1', startDate: '2027-06-10', endDate: '2027-06-15', status: 'confirmed', userName: 'Jane' },
    ]
    const info = computeDayInfo('2027-06-15', reservations, [], rules)
    expect(info.bookedByName).toBeNull()
  })

  it('ignores a cancelled reservation', () => {
    const reservations: ReservationRow[] = [
      { id: 'r1', userId: 'u1', startDate: '2027-06-10', endDate: '2027-06-15', status: 'cancelled', userName: 'Jane' },
    ]
    const info = computeDayInfo('2027-06-12', reservations, [], rules)
    expect(info.bookedByName).toBeNull()
  })

  it('reports a day covered by a blocked range as blocked', () => {
    const blocked: BlockedDateRow[] = [{ id: 'b1', startDate: '2027-06-10', endDate: '2027-06-15', reason: null }]
    const info = computeDayInfo('2027-06-12', [], blocked, rules)
    expect(info.isBlocked).toBe(true)
  })

  it('reports a day exactly on the horizon date as not past-horizon', () => {
    const info = computeDayInfo('2027-12-31', [], [], rules)
    expect(info.isPastHorizon).toBe(false)
  })

  it('reports a day one day after the horizon date as past-horizon', () => {
    const info = computeDayInfo('2028-01-01', [], [], rules)
    expect(info.isPastHorizon).toBe(true)
  })
})
