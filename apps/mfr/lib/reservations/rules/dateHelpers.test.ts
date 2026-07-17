import { describe, it, expect } from 'vitest'
import { addDays, nightsBetween, rangesOverlap, calendarYearOf } from './dateHelpers'

describe('addDays', () => {
  it('adds a single day within a month', () => {
    expect(addDays('2027-07-01', 1)).toBe('2027-07-02')
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2027-07-31', 1)).toBe('2027-08-01')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
  })
})

describe('nightsBetween', () => {
  it('counts nights for a multi-day range', () => {
    expect(nightsBetween('2027-07-01', '2027-07-05')).toBe(4)
  })

  it('counts a single night', () => {
    expect(nightsBetween('2027-07-01', '2027-07-02')).toBe(1)
  })

  it('counts nights correctly across a month boundary', () => {
    expect(nightsBetween('2027-07-30', '2027-08-02')).toBe(3)
  })

  it('counts nights correctly across a year boundary', () => {
    expect(nightsBetween('2027-12-30', '2028-01-03')).toBe(4)
  })
})

describe('rangesOverlap', () => {
  it('returns true for fully overlapping ranges', () => {
    expect(rangesOverlap('2027-07-01', '2027-07-10', '2027-07-03', '2027-07-05')).toBe(true)
  })

  it('returns true for partially overlapping ranges', () => {
    expect(rangesOverlap('2027-07-01', '2027-07-05', '2027-07-03', '2027-07-08')).toBe(true)
  })

  it('returns false for non-overlapping ranges with a gap', () => {
    expect(rangesOverlap('2027-07-01', '2027-07-05', '2027-07-10', '2027-07-15')).toBe(false)
  })

  it('returns false when one range ends exactly when the other starts (half-open, same-day turnover)', () => {
    expect(rangesOverlap('2027-07-01', '2027-07-05', '2027-07-05', '2027-07-08')).toBe(false)
    expect(rangesOverlap('2027-07-05', '2027-07-08', '2027-07-01', '2027-07-05')).toBe(false)
  })

  it('returns true for identical ranges', () => {
    expect(rangesOverlap('2027-07-01', '2027-07-05', '2027-07-01', '2027-07-05')).toBe(true)
  })
})

describe('calendarYearOf', () => {
  it('extracts the year from a date string', () => {
    expect(calendarYearOf('2027-07-01')).toBe(2027)
  })

  it('extracts the year for a December date', () => {
    expect(calendarYearOf('2027-12-31')).toBe(2027)
  })
})
