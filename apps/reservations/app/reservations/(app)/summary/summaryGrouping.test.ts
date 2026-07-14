import { describe, it, expect } from 'vitest'
import { groupByUser, type SummaryReservation } from './summaryGrouping'

const today = '2027-07-10'

function makeReservation(overrides: Partial<SummaryReservation> = {}): SummaryReservation {
  return {
    id: 'r1',
    userId: 'u1',
    userName: 'Jane',
    startDate: '2027-07-01',
    endDate: '2027-07-05',
    status: 'confirmed',
    ...overrides,
  }
}

describe('groupByUser', () => {
  it('classifies a reservation ending before today as past', () => {
    const groups = groupByUser(
      [makeReservation({ startDate: '2027-06-01', endDate: '2027-06-05' })],
      today,
    )
    expect(groups[0].past).toHaveLength(1)
    expect(groups[0].upcoming).toHaveLength(0)
  })

  it('classifies a reservation ending exactly on today as past (fully checked out)', () => {
    const groups = groupByUser(
      [makeReservation({ startDate: '2027-07-06', endDate: today })],
      today,
    )
    expect(groups[0].past).toHaveLength(1)
    expect(groups[0].upcoming).toHaveLength(0)
  })

  it('classifies a reservation starting after today as upcoming', () => {
    const groups = groupByUser(
      [makeReservation({ startDate: '2027-08-01', endDate: '2027-08-05' })],
      today,
    )
    expect(groups[0].upcoming).toHaveLength(1)
    expect(groups[0].past).toHaveLength(0)
  })

  it('classifies an in-progress stay (today falls inside the range) as upcoming, not past', () => {
    const groups = groupByUser(
      [makeReservation({ startDate: '2027-07-08', endDate: '2027-07-12' })],
      today,
    )
    expect(groups[0].upcoming).toHaveLength(1)
    expect(groups[0].past).toHaveLength(0)
  })

  it('excludes cancelled reservations entirely, including from subtotals', () => {
    const groups = groupByUser(
      [
        makeReservation({
          id: 'r1',
          status: 'cancelled',
          startDate: '2027-08-01',
          endDate: '2027-08-05',
        }),
        makeReservation({
          id: 'r2',
          status: 'confirmed',
          startDate: '2027-08-10',
          endDate: '2027-08-12',
        }),
      ],
      today,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].upcoming.map((r) => r.id)).toEqual(['r2'])
    expect(groups[0].upcomingNights).toBe(2)
  })

  it('returns no groups when every reservation for a user is cancelled', () => {
    const groups = groupByUser([makeReservation({ status: 'cancelled' })], today)
    expect(groups).toHaveLength(0)
  })

  it('computes per-person upcoming/past/total night subtotals across multiple reservations', () => {
    const groups = groupByUser(
      [
        makeReservation({ id: 'r1', startDate: '2027-06-01', endDate: '2027-06-05' }), // past, 4 nights
        makeReservation({ id: 'r2', startDate: '2027-08-01', endDate: '2027-08-04' }), // upcoming, 3 nights
        makeReservation({ id: 'r3', startDate: '2027-09-01', endDate: '2027-09-03' }), // upcoming, 2 nights
      ],
      today,
    )
    expect(groups[0].pastNights).toBe(4)
    expect(groups[0].upcomingNights).toBe(5)
    expect(groups[0].totalNights).toBe(9)
  })

  it('sorts upcoming reservations ascending by start date and past descending (most recent past first)', () => {
    const groups = groupByUser(
      [
        makeReservation({ id: 'up-later', startDate: '2027-09-01', endDate: '2027-09-03' }),
        makeReservation({ id: 'up-sooner', startDate: '2027-08-01', endDate: '2027-08-03' }),
        makeReservation({ id: 'past-older', startDate: '2027-01-01', endDate: '2027-01-03' }),
        makeReservation({ id: 'past-newer', startDate: '2027-06-01', endDate: '2027-06-03' }),
      ],
      today,
    )
    expect(groups[0].upcoming.map((r) => r.id)).toEqual(['up-sooner', 'up-later'])
    expect(groups[0].past.map((r) => r.id)).toEqual(['past-newer', 'past-older'])
  })

  it('groups separate users and sorts groups alphabetically by name', () => {
    const groups = groupByUser(
      [
        makeReservation({
          id: 'r1',
          userId: 'u-zed',
          userName: 'Zed',
          startDate: '2027-08-01',
          endDate: '2027-08-02',
        }),
        makeReservation({
          id: 'r2',
          userId: 'u-amy',
          userName: 'Amy',
          startDate: '2027-08-01',
          endDate: '2027-08-02',
        }),
      ],
      today,
    )
    expect(groups.map((g) => g.userName)).toEqual(['Amy', 'Zed'])
  })

  it('falls back to "Unknown user" when userName is null', () => {
    const groups = groupByUser([makeReservation({ userName: null })], today)
    expect(groups[0].userName).toBe('Unknown user')
  })
})
