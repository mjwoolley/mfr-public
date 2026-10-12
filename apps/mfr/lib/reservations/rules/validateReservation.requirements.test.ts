// Requirement tests for CAP-021 Booking limits, run against the pure rules
// engine with the feature's Background: horizon 2030-12-31, 14 consecutive
// nights, 60 nights a year, today March 10, 2027. Each outcome asserts the
// exact message a member sees, not just the code.

import { describe, it, expect } from 'vitest'
import {
  validateReservation,
  type ExistingReservation,
  type ValidateReservationInput,
} from './validateReservation'

const background = {
  bookingRules: {
    bookingHorizonDate: '2030-12-31',
    maxConsecutiveNights: 14,
    maxNightsPerUserPerYear: 60,
  },
  today: '2027-03-10',
}

function check(over: Partial<ValidateReservationInput> & { startDate: string; endDate: string }) {
  return validateReservation({
    userId: 'me',
    existingReservations: [],
    blockedDates: [],
    isAdmin: false,
    ...background,
    ...over,
  })
}

function stay(
  id: string,
  userId: string,
  startDate: string,
  endDate: string,
  status: ExistingReservation['status'] = 'confirmed',
): ExistingReservation {
  return { id, userId, startDate, endDate, status }
}

function refusedWith(result: ReturnType<typeof validateReservation>) {
  if (result.valid) return null
  return result.reason
}

// Builds N confirmed nights for a user in 2027 as stays of at most 14 nights,
// starting Jan 1 (each stay separated so none overlap).
function nightsIn2027(userId: string, total: number, prefix = userId): ExistingReservation[] {
  const out: ExistingReservation[] = []
  let month = 1
  let left = total
  while (left > 0) {
    const n = Math.min(14, left)
    const mm = String(month).padStart(2, '0')
    const end = String(1 + n).padStart(2, '0')
    out.push(stay(`${prefix}-${month}`, userId, `2027-${mm}-01`, `2027-${mm}-${end}`))
    left -= n
    month++
  }
  return out
}

const PAST = "New reservations can't be entirely in the past."
const HORIZON = "Reservations cannot start after 2030-12-31. That date range isn't open yet."
const MAX = 'Reservations cannot exceed 14 consecutive nights.'
const CAP_2027 = 'This would exceed your 60-night limit for 2027.'
const OVERLAP = 'Those dates overlap an existing reservation.'

describe('CAP-021 Booking limits', () => {
  it('CAP-021 · Check-out must be after check-in (both on July 10, 2027)', () => {
    expect(refusedWith(check({ startDate: '2027-07-10', endDate: '2027-07-10' }))).toBe(
      'The end date must be after the start date.',
    )
  })

  it.each([
    ['2027-03-05', '2027-03-09', PAST],
    ['2027-03-08', '2027-03-10', PAST],
    ['2027-03-09', '2027-03-11', null],
    ['2027-03-10', '2027-03-12', null],
  ])('CAP-021 · A new stay cannot be entirely in the past (%s → %s)', (startDate, endDate, msg) => {
    expect(refusedWith(check({ startDate, endDate }))).toBe(msg)
  })

  it.each([
    ['2030-12-30', '2030-12-31', null],
    ['2030-12-31', '2031-01-01', null],
    ['2031-01-01', '2031-01-03', HORIZON],
  ])(
    'CAP-021 · Stays cannot start after the booking horizon (%s → %s)',
    (startDate, endDate, msg) => {
      expect(refusedWith(check({ startDate, endDate }))).toBe(msg)
    },
  )

  it.each([
    [14, '2027-07-15', null],
    [15, '2027-07-16', MAX],
  ])(
    'CAP-021 · A stay cannot exceed the maximum consecutive nights (%i nights)',
    (_n, endDate, msg) => {
      expect(refusedWith(check({ startDate: '2027-07-01', endDate }))).toBe(msg)
    },
  )

  it.each([
    [10, '2027-08-11', null],
    [11, '2027-08-12', CAP_2027],
  ])(
    'CAP-021 · A person’s nights in a calendar year are capped (50 booked + %i)',
    (_n, endDate, msg) => {
      const existing = nightsIn2027('me', 50)
      expect(
        refusedWith(check({ startDate: '2027-08-01', endDate, existingReservations: existing })),
      ).toBe(msg)
    },
  )

  it('CAP-021 · A stay counts entirely toward the year it starts in (58 booked, Dec 30 → Jan 3 refused for 2027)', () => {
    const existing = nightsIn2027('me', 58)
    // 2 nights fall in 2027 (fits under 60), 2 in 2028 — all 4 count toward 2027.
    expect(
      refusedWith(
        check({ startDate: '2027-12-30', endDate: '2028-01-03', existingReservations: existing }),
      ),
    ).toBe(CAP_2027)
    // Control: the same stay with 56 booked fits exactly (56 + 4 = 60).
    expect(
      check({
        startDate: '2027-12-30',
        endDate: '2028-01-03',
        existingReservations: nightsIn2027('me', 56),
      }).valid,
    ).toBe(true)
  })

  it('CAP-021 · Other members’ nights and cancelled stays do not count toward my limit', () => {
    const others = nightsIn2027('carol', 60)
    // My cancelled stays: 30 nights in 2027 (placed on free dates Sep–Nov).
    const myCancelled = [
      stay('c1', 'me', '2027-09-01', '2027-09-11', 'cancelled'),
      stay('c2', 'me', '2027-10-01', '2027-10-11', 'cancelled'),
      stay('c3', 'me', '2027-11-01', '2027-11-11', 'cancelled'),
    ]
    // Plus 46 confirmed nights of my own (14 + 14 + 14 + 4), so the booking
    // fits exactly at 60 — and would break the cap if the cancelled 30 counted.
    const mine = [
      stay('m1', 'me', '2027-06-01', '2027-06-15'),
      stay('m2', 'me', '2027-07-01', '2027-07-15'),
      stay('m3', 'me', '2027-12-01', '2027-12-15'),
      stay('m4', 'me', '2027-08-20', '2027-08-24'),
    ]
    const result = check({
      startDate: '2027-08-01',
      endDate: '2027-08-15',
      existingReservations: [...others, ...myCancelled, ...mine],
    })
    expect(result.valid).toBe(true)
  })

  it.each([
    ['2027-07-08', '2027-07-11'],
    ['2027-07-12', '2027-07-15'],
    ['2027-07-11', '2027-07-12'],
    ['2027-07-09', '2027-07-14'],
  ])('CAP-021 · Stays cannot overlap anyone’s confirmed stay (%s → %s)', (startDate, endDate) => {
    const existing = [stay('carol-1', 'carol', '2027-07-10', '2027-07-13')]
    expect(refusedWith(check({ startDate, endDate, existingReservations: existing }))).toBe(OVERLAP)
  })

  it('CAP-021 · Stays cannot overlap blocked dates (message)', () => {
    const blockedDates = [{ startDate: '2027-08-10', endDate: '2027-08-13' }]
    expect(
      refusedWith(check({ startDate: '2027-08-11', endDate: '2027-08-12', blockedDates })),
    ).toBe('Those dates are blocked and unavailable.')
  })

  it('CAP-021 · Arriving the day a blocked period ends is allowed without a warning', () => {
    // Blocked for the NIGHTS of Aug 10–12: the first free night is Aug 13.
    const blockedDates = [{ startDate: '2027-08-10', endDate: '2027-08-13' }]
    const result = check({ startDate: '2027-08-13', endDate: '2027-08-15', blockedDates })
    expect(result).toEqual({ valid: true, warnings: [] })
  })

  it.each([
    ['a stay starting January 1, 2031', '2031-01-01', '2031-01-03', HORIZON],
    ['a 15-night stay starting July 1, 2027', '2027-07-01', '2027-07-16', MAX],
    ['dates overlapping another member’s confirmed stay', '2027-07-11', '2027-07-12', OVERLAP],
  ])(
    'CAP-021 · Admins are exempt from the past-date rule only (%s)',
    (_label, startDate, endDate, msg) => {
      const existing = [stay('carol-1', 'carol', '2027-07-10', '2027-07-13')]
      expect(
        refusedWith(check({ startDate, endDate, isAdmin: true, existingReservations: existing })),
      ).toBe(msg)
    },
  )

  it('CAP-021 · Admins may record stays that are already over (Mar 5 → Mar 9 allowed)', () => {
    expect(check({ startDate: '2027-03-05', endDate: '2027-03-09', isAdmin: true }).valid).toBe(
      true,
    )
  })
})
