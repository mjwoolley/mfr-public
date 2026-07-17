import { describe, it, expect } from 'vitest'
import {
  fiscalYear,
  fiscalYearLabel,
  fiscalYearRange,
  currentFiscalYear,
  FISCAL_START_MONTH,
} from '@/lib/accounting/fiscalYear'

describe('fiscalYear', () => {
  it('puts March through December in the fiscal year named by that calendar year', () => {
    expect(fiscalYear(new Date('2025-03-01T00:00:00Z'))).toBe(2025)
    expect(fiscalYear(new Date('2025-07-12T12:00:00Z'))).toBe(2025)
    expect(fiscalYear(new Date('2025-12-31T23:59:59Z'))).toBe(2025)
  })

  it("rolls January and February into the previous calendar year's fiscal year", () => {
    expect(fiscalYear(new Date('2026-01-02T12:00:00Z'))).toBe(2025)
    expect(fiscalYear(new Date('2026-02-27T12:00:00Z'))).toBe(2025)
  })

  it('handles the Feb-28 / Mar-1 boundary', () => {
    expect(fiscalYear(new Date('2026-02-28T23:59:59Z'))).toBe(2025)
    expect(fiscalYear(new Date('2026-03-01T00:00:00Z'))).toBe(2026)
  })

  it('derives the year in UTC, independent of local time', () => {
    // 2026-03-01T00:30 UTC is still Feb 28 in US timezones, but UTC governs.
    expect(fiscalYear(new Date('2026-03-01T00:30:00Z'))).toBe(2026)
  })
})

describe('fiscalYearLabel', () => {
  it('formats as FY####', () => {
    expect(fiscalYearLabel(2025)).toBe('FY2025')
  })
})

describe('fiscalYearRange', () => {
  it('returns the half-open [Mar 1, next Mar 1) range', () => {
    const { start, end } = fiscalYearRange(2025)
    expect(start.toISOString()).toBe('2025-03-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('range endpoints agree with fiscalYear at the boundaries', () => {
    const { start, end } = fiscalYearRange(2025)
    expect(fiscalYear(start)).toBe(2025)
    // end is exclusive: Mar 1 of the next FY belongs to the next year.
    expect(fiscalYear(end)).toBe(2026)
    expect(fiscalYear(new Date(end.getTime() - 1))).toBe(2025)
  })
})

describe('currentFiscalYear', () => {
  it('uses the fiscal year containing the given instant', () => {
    expect(currentFiscalYear(new Date('2026-07-12T00:00:00Z'))).toBe(2026)
    expect(currentFiscalYear(new Date('2026-02-01T00:00:00Z'))).toBe(2025)
  })
})

describe('FISCAL_START_MONTH', () => {
  it('is March (1-indexed)', () => {
    expect(FISCAL_START_MONTH).toBe(3)
  })
})
