import { describe, expect, it } from 'vitest'
import { niceDate, niceRange, nightsLabel } from './formatDates'

describe('niceDate', () => {
  it('formats an ISO date as "Mon D" in UTC', () => {
    expect(niceDate('2026-07-03')).toBe('Jul 3')
  })
})

describe('niceRange', () => {
  // Storage is half-open [start, end); the range is displayed as CHECK-IN →
  // CHECK-OUT, endDate being the exclusive checkout day.
  it('shows the check-in and check-out dates', () => {
    // Jul 3 check-in, Jul 5 checkout = 2 nights (Jul 3, Jul 4).
    expect(niceRange('2026-07-03', '2026-07-05')).toBe('Jul 3 → Jul 5')
  })

  it('shows consecutive days for a single-night stay', () => {
    // Jul 3 check-in, Jul 4 checkout = 1 night (Jul 3).
    expect(niceRange('2026-07-03', '2026-07-04')).toBe('Jul 3 → Jul 4')
  })

  it('crosses a month boundary correctly', () => {
    // Jul 31 check-in, Aug 2 checkout = 2 nights.
    expect(niceRange('2026-07-31', '2026-08-02')).toBe('Jul 31 → Aug 2')
  })
})

describe('nightsLabel', () => {
  it('counts nights over the half-open range and pluralizes', () => {
    expect(nightsLabel('2026-07-03', '2026-07-04')).toBe('1 night')
    expect(nightsLabel('2026-07-03', '2026-07-05')).toBe('2 nights')
  })
})
