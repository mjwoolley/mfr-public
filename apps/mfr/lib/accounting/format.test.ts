import { describe, expect, it } from 'vitest'
import { formatShares, signedShares, formatUSD0, signedUSD0, formatDate } from './format'

describe('formatShares', () => {
  // The whole point of the helper: a share count is a count.
  it('never renders a currency symbol', () => {
    expect(formatShares(250)).not.toContain('$')
  })

  it('groups thousands', () => {
    expect(formatShares(1234567)).toBe('1,234,567')
  })

  it('accepts the numeric string Drizzle returns for numeric(12,2)', () => {
    expect(formatShares('250')).toBe('250')
    expect(formatShares('250.00')).toBe('250')
  })

  // Rounding a fractional holding away in the ownership report would be a
  // misreport, so up to two decimals survive.
  it('keeps real fractions but drops trailing zeros', () => {
    expect(formatShares(1234.5)).toBe('1,234.5')
    expect(formatShares('75.25')).toBe('75.25')
  })

  it('formats zero and negatives', () => {
    expect(formatShares(0)).toBe('0')
    expect(formatShares(-75.25)).toBe('-75.25')
  })
})

describe('signedShares', () => {
  it('marks a gain with a plus and leaves the minus on a loss', () => {
    expect(signedShares(250)).toBe('+250')
    expect(signedShares('250')).toBe('+250')
    expect(signedShares(-100)).toBe('-100')
    expect(signedShares(0)).toBe('+0')
  })
})

describe('formatUSD0', () => {
  it('formats whole dollars', () => {
    expect(formatUSD0(1234.5)).toBe('$1,235')
    expect(formatUSD0('980')).toBe('$980')
    expect(formatUSD0(-980)).toBe('-$980')
  })
})

describe('signedUSD0', () => {
  it('marks money in with a plus', () => {
    expect(signedUSD0(1200)).toBe('+$1,200')
    expect(signedUSD0(-980)).toBe('-$980')
  })
})

describe('formatDate', () => {
  it('formats a date in medium style', () => {
    expect(formatDate(new Date('2026-07-04T12:00:00-05:00'))).toBe('Jul 4, 2026')
  })

  // Back-dated transactions are stored at noon UTC and fiscal-year math reads
  // getUTC*, so rendering must be UTC too or the displayed day could disagree
  // with the year the amount counted in.
  it('renders in UTC, not the server timezone', () => {
    // 2019-06-15T12:00:00Z is still Jun 15 in UTC but Jun 15 *evening* in
    // Tokyo and Jun 15 *morning* in New York — the boundary case is a stamp
    // near midnight UTC, which must not slide a day.
    expect(formatDate(new Date('2019-03-01T00:30:00Z'))).toBe('Mar 1, 2019')
    expect(formatDate(new Date('2019-06-15T12:00:00Z'))).toBe('Jun 15, 2019')
  })
})
