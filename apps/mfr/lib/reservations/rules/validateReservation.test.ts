import { describe, it, expect } from 'vitest'
import {
  validateReservation,
  type ExistingReservation,
  type BookingRules,
} from './validateReservation'

const defaultRules: BookingRules = {
  bookingHorizonDate: '2027-12-31',
  maxConsecutiveNights: 7,
  maxNightsPerUserPerYear: 14,
}

function baseInput(overrides: Partial<Parameters<typeof validateReservation>[0]> = {}) {
  return {
    userId: 'user-1',
    startDate: '2027-06-01',
    endDate: '2027-06-05',
    existingReservations: [] as ExistingReservation[],
    blockedDates: [],
    bookingRules: defaultRules,
    isAdmin: false,
    // Well before the base 2027-06 dates, so the past-date rule never trips
    // unless a test deliberately moves `today` forward.
    today: '2027-01-01',
    ...overrides,
  }
}

describe('validateReservation — basic validity', () => {
  it('accepts a valid reservation with no conflicts', () => {
    const result = validateReservation(baseInput())
    expect(result.valid).toBe(true)
  })

  it('rejects when endDate is not after startDate', () => {
    const result = validateReservation(
      baseInput({ startDate: '2027-06-05', endDate: '2027-06-05' }),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('INVALID_RANGE')
  })
})

describe('validateReservation — past-date rule', () => {
  it('rejects a NEW fully-past reservation by a non-admin (checkout on/before today)', () => {
    const result = validateReservation(
      baseInput({ startDate: '2027-06-01', endDate: '2027-06-05', today: '2027-06-15' }),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('PAST_DATE')
  })

  it('rejects when the checkout day equals today (every night is before today)', () => {
    const result = validateReservation(
      baseInput({ startDate: '2027-06-01', endDate: '2027-06-15', today: '2027-06-15' }),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('PAST_DATE')
  })

  it('lets an admin create a fully-past reservation (backfill)', () => {
    const result = validateReservation(
      baseInput({
        startDate: '2027-06-01',
        endDate: '2027-06-05',
        today: '2027-06-15',
        isAdmin: true,
      }),
    )
    expect(result.valid).toBe(true)
  })

  it('exempts EDITS: a non-admin can extend the end date of a stay that started before today', () => {
    const result = validateReservation(
      baseInput({
        startDate: '2027-06-10', // began before today
        endDate: '2027-06-16', // extending an ongoing stay (6 nights, within the cap)
        today: '2027-06-15',
        excludeReservationId: 'r1',
      }),
    )
    expect(result.valid).toBe(true)
  })

  it('accepts a NEW reservation starting today (not entirely in the past)', () => {
    const result = validateReservation(
      baseInput({ startDate: '2027-06-15', endDate: '2027-06-18', today: '2027-06-15' }),
    )
    expect(result.valid).toBe(true)
  })
})

describe('validateReservation — booking horizon', () => {
  it('accepts a reservation starting exactly on the horizon date', () => {
    const result = validateReservation(
      baseInput({ startDate: '2027-12-31', endDate: '2028-01-02', bookingRules: defaultRules }),
    )
    expect(result.valid).toBe(true)
  })

  it('rejects a reservation starting one day after the horizon date', () => {
    const result = validateReservation(
      baseInput({ startDate: '2028-01-01', endDate: '2028-01-03', bookingRules: defaultRules }),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('HORIZON')
  })
})

describe('validateReservation — max consecutive nights', () => {
  it('accepts a reservation exactly at the max consecutive nights', () => {
    // 7 nights: 2027-06-01 to 2027-06-08
    const result = validateReservation(
      baseInput({ startDate: '2027-06-01', endDate: '2027-06-08' }),
    )
    expect(result.valid).toBe(true)
  })

  it('rejects a reservation one night over the max', () => {
    // 8 nights: 2027-06-01 to 2027-06-09
    const result = validateReservation(
      baseInput({ startDate: '2027-06-01', endDate: '2027-06-09' }),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('MAX_CONSECUTIVE')
  })
})

describe('validateReservation — yearly cap', () => {
  it('accepts when existing + new nights exactly equal the cap', () => {
    // existing: 10 nights in 2027 (Jan 1-11), new: 4 nights (Jun 1-5) = 14 total, cap is 14
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'user-1',
        startDate: '2027-01-01',
        endDate: '2027-01-11',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
  })

  it('rejects when existing + new nights exceed the cap by one', () => {
    // existing: 11 nights in 2027, new: 4 nights = 15 total, cap is 14
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'user-1',
        startDate: '2027-01-01',
        endDate: '2027-01-12',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('YEARLY_CAP')
  })

  it('buckets a reservation spanning Dec 30 - Jan 3 entirely against the start year', () => {
    // existing reservation itself spans two years but should count fully
    // against 2027 (its start year), not split across years.
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'user-1',
        startDate: '2027-12-30',
        endDate: '2028-01-03',
        status: 'confirmed',
      },
      // 4 nights, all counted against 2027
    ]
    // Raise maxConsecutiveNights for this test so the 10/11-night probe
    // reservation below is only ever evaluated against the yearly cap, not
    // independently rejected by the (unrelated) max-consecutive-nights rule.
    const rulesForThisTest: BookingRules = { ...defaultRules, maxConsecutiveNights: 11 }

    // A second 2027 reservation of 10 nights would bring the 2027 total to 14 (exactly the cap).
    const result = validateReservation(
      baseInput({
        startDate: '2027-03-01',
        endDate: '2027-03-11', // 10 nights
        existingReservations: existing,
        bookingRules: rulesForThisTest,
      }),
    )
    expect(result.valid).toBe(true)

    // One more night pushes 2027's total to 15, over the cap.
    const resultOver = validateReservation(
      baseInput({
        startDate: '2027-03-01',
        endDate: '2027-03-12', // 11 nights
        existingReservations: existing,
        bookingRules: rulesForThisTest,
      }),
    )
    expect(resultOver.valid).toBe(false)
    if (!resultOver.valid) expect(resultOver.code).toBe('YEARLY_CAP')
  })

  it("does not count another user's reservations against this user's cap", () => {
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'someone-else',
        startDate: '2027-01-01',
        endDate: '2027-01-11',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
  })

  it('excludes a reservation by id from its own cap recalculation (edit scenario)', () => {
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'user-1',
        startDate: '2027-01-01',
        endDate: '2027-01-12',
        status: 'confirmed',
      }, // 11 nights
    ]
    // Editing r1 itself to shift dates slightly (still 11 nights) should not
    // double-count r1 against itself.
    const result = validateReservation(
      baseInput({
        startDate: '2027-02-01',
        endDate: '2027-02-05', // 4 nights, total would be 15 if r1 weren't excluded
        excludeReservationId: 'r1',
        existingReservations: existing,
      }),
    )
    expect(result.valid).toBe(true)
  })
})

describe('validateReservation — overlap against other reservations', () => {
  it('rejects when overlapping another confirmed reservation (any user)', () => {
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'someone-else',
        startDate: '2027-06-03',
        endDate: '2027-06-06',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('OVERLAP_BOOKED')
  })

  it('does not reject when overlapping a cancelled reservation', () => {
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'someone-else',
        startDate: '2027-06-03',
        endDate: '2027-06-06',
        status: 'cancelled',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
  })

  it('allows same-day turnover against an existing confirmed reservation', () => {
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'someone-else',
        startDate: '2027-05-28',
        endDate: '2027-06-01',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
  })
})

describe('validateReservation — same-day turnover warnings', () => {
  it('warns (but stays valid) when the new check-in lands on an existing checkout', () => {
    // existing checks out 2027-06-01; base input checks in 2027-06-01.
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'someone-else',
        startDate: '2027-05-28',
        endDate: '2027-06-01',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toMatchObject({
        code: 'TURNOVER_CHECKIN',
        otherReservationId: 'r1',
        otherUserId: 'someone-else',
      })
    }
  })

  it('warns (but stays valid) when the new checkout lands on an existing check-in', () => {
    // base input checks out 2027-06-05; existing checks in 2027-06-05.
    const existing: ExistingReservation[] = [
      {
        id: 'r2',
        userId: 'someone-else',
        startDate: '2027-06-05',
        endDate: '2027-06-09',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toMatchObject({
        code: 'TURNOVER_CHECKOUT',
        otherReservationId: 'r2',
      })
    }
  })

  it('emits no warning for a fully-separated stay', () => {
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'someone-else',
        startDate: '2027-07-01',
        endDate: '2027-07-05',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.warnings).toEqual([])
  })

  it('does not warn against a cancelled reservation at the boundary', () => {
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'someone-else',
        startDate: '2027-05-28',
        endDate: '2027-06-01',
        status: 'cancelled',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.warnings).toEqual([])
  })

  it('does not warn against the reservation being edited (excluded by id)', () => {
    // Editing r1, whose own checkout equals the new check-in — must not
    // self-warn.
    const existing: ExistingReservation[] = [
      {
        id: 'r1',
        userId: 'user-1',
        startDate: '2027-05-28',
        endDate: '2027-06-01',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(
      baseInput({ existingReservations: existing, excludeReservationId: 'r1' }),
    )
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.warnings).toEqual([])
  })

  it("does not warn when the boundary touches the booker's OWN other reservation", () => {
    // A back-to-back stay against your own reservation needs no coordination —
    // there is no other party. (Not excluded by id: a genuinely separate stay.)
    const existing: ExistingReservation[] = [
      {
        id: 'r-own',
        userId: 'user-1', // same as the booker in baseInput
        startDate: '2027-05-28',
        endDate: '2027-06-01', // its checkout == the new check-in (2027-06-01)
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.warnings).toEqual([])
  })

  it("warns only for the other party's boundary, not the booker's own, on the same stay", () => {
    // Check-in touches someone else's checkout (warn); check-out touches the
    // booker's own check-in (no warn) — only the cross-party warning survives.
    const existing: ExistingReservation[] = [
      {
        id: 'other',
        userId: 'someone-else',
        startDate: '2027-05-28',
        endDate: '2027-06-01', // their checkout == new check-in -> TURNOVER_CHECKIN
        status: 'confirmed',
      },
      {
        id: 'mine',
        userId: 'user-1',
        startDate: '2027-06-05', // my own check-in == new check-out (no warn)
        endDate: '2027-06-08',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toMatchObject({
        code: 'TURNOVER_CHECKIN',
        otherReservationId: 'other',
      })
    }
  })

  it('does not warn for adjacency to a blocked date range (no other party)', () => {
    // new checkout 2027-06-05 touches blocked range starting 2027-06-05.
    const result = validateReservation(
      baseInput({ blockedDates: [{ startDate: '2027-06-05', endDate: '2027-06-10' }] }),
    )
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.warnings).toEqual([])
  })

  it('flags a stay that is a turnover on both ends', () => {
    const existing: ExistingReservation[] = [
      {
        id: 'before',
        userId: 'someone-else',
        startDate: '2027-05-28',
        endDate: '2027-06-01',
        status: 'confirmed',
      },
      {
        id: 'after',
        userId: 'another',
        startDate: '2027-06-05',
        endDate: '2027-06-09',
        status: 'confirmed',
      },
    ]
    const result = validateReservation(baseInput({ existingReservations: existing }))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.warnings.map((w) => w.code).sort()).toEqual([
        'TURNOVER_CHECKIN',
        'TURNOVER_CHECKOUT',
      ])
    }
  })
})

describe('validateReservation — overlap against blocked dates', () => {
  it('rejects when overlapping a blocked date range', () => {
    const result = validateReservation(
      baseInput({ blockedDates: [{ startDate: '2027-06-02', endDate: '2027-06-04' }] }),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('OVERLAP_BLOCKED')
  })

  it('accepts when adjacent to (not overlapping) a blocked date range', () => {
    const result = validateReservation(
      baseInput({ blockedDates: [{ startDate: '2027-06-05', endDate: '2027-06-10' }] }),
    )
    expect(result.valid).toBe(true)
  })
})
