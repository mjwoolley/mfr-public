import { describe, expect, it } from 'vitest'
import {
  fiscalYearForInput,
  fiscalYearSpanLabel,
  parseTransactionDate,
  todayInputValue,
} from './transactionDate'
import { fiscalYear } from './fiscalYear'

// A fixed "now" so "today" and "future" are deterministic.
const NOW = new Date('2026-07-31T09:00:00Z')

function parsed(raw: string | null | undefined, now = NOW) {
  const result = parseTransactionDate(raw, now)
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result.date
}

describe('todayInputValue', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayInputValue(new Date(2026, 6, 4))).toBe('2026-07-04')
  })

  it('zero-pads single-digit months and days', () => {
    expect(todayInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('parseTransactionDate — "leave it to the database"', () => {
  it('returns null for a blank value', () => {
    expect(parsed('')).toBeNull()
    expect(parsed('   ')).toBeNull()
  })

  it('returns null for a missing field', () => {
    expect(parsed(null)).toBeNull()
    expect(parsed(undefined)).toBeNull()
  })

  // Otherwise every same-day transaction would get the identical noon stamp
  // and the history list (ordered by createdAt desc) would shuffle.
  it("returns null for today's date, so CURRENT_TIMESTAMP keeps them distinct", () => {
    expect(parsed(todayInputValue(NOW))).toBeNull()
  })
})

describe('parseTransactionDate — back-dating', () => {
  it('stores a past date at noon UTC, so it renders as the typed day in any timezone', () => {
    const date = parsed('2019-06-15')!

    expect(date.getUTCFullYear()).toBe(2019)
    expect(date.getUTCMonth()).toBe(5)
    expect(date.getUTCDate()).toBe(15)
    expect(date.getUTCHours()).toBe(12)
  })

  // The fiscal year runs Mar 1 – end of Feb, which is exactly where a
  // back-dating admin will slip. These two days are the boundary.
  it('puts the last day of February in the PREVIOUS fiscal year', () => {
    expect(fiscalYear(parsed('2025-02-28')!)).toBe(2024)
  })

  it('puts March 1 in the new fiscal year', () => {
    expect(fiscalYear(parsed('2025-03-01')!)).toBe(2025)
  })
})

describe('parseTransactionDate — rejections', () => {
  it('rejects a non date-only string', () => {
    for (const bad of ['not-a-date', '06/15/2019', '2019-6-15', '2019-06-15T00:00:00Z']) {
      expect(parseTransactionDate(bad, NOW)).toEqual({ ok: false, error: 'Enter a valid date' })
    }
  })

  it('rejects a day that does not exist rather than silently rolling it over', () => {
    // Date.UTC(2025, 1, 31) quietly becomes March 3.
    expect(parseTransactionDate('2025-02-31', NOW)).toEqual({
      ok: false,
      error: 'Enter a valid date',
    })
    expect(parseTransactionDate('2025-13-01', NOW)).toEqual({
      ok: false,
      error: 'Enter a valid date',
    })
  })

  it('rejects a future date', () => {
    expect(parseTransactionDate('2026-08-01', NOW)).toEqual({
      ok: false,
      error: 'A share transaction cannot be dated in the future',
    })
  })
})

describe('fiscalYearForInput', () => {
  it('reports the fiscal year a typed date lands in', () => {
    expect(fiscalYearForInput('2025-02-28')).toBe(2024)
    expect(fiscalYearForInput('2025-03-01')).toBe(2025)
  })

  it('returns null for anything not a complete date', () => {
    expect(fiscalYearForInput('')).toBeNull()
    expect(fiscalYearForInput('2025-03')).toBeNull()
  })
})

describe('fiscalYearSpanLabel', () => {
  it('spells out the span so the March boundary is visible', () => {
    expect(fiscalYearSpanLabel(2024)).toBe('Mar 2024 – Feb 2025')
  })
})
