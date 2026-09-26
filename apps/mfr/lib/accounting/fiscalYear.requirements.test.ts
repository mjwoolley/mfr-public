// Requirement coverage for the fiscal-year rule (CAP-037), using the
// feature's Examples rows literally: the date an admin types is parsed exactly
// as the record actions parse it, then bucketed by the one fiscal-year rule
// every year-based figure uses.
import { describe, it, expect } from 'vitest'
import { fiscalYear, fiscalYearLabel } from './fiscalYear'
import { parseTransactionDate } from './transactionDate'

// Well after every example, so none of them is "today" or in the future.
const NOW = new Date('2026-09-26T12:00:00Z')

describe('CAP-037 Transaction dates and fiscal year', () => {
  it.each([
    ['2019-02-28', 'FY2018'], // 28 February 2019
    ['2020-02-29', 'FY2019'], // 29 February 2020 (leap day)
    ['2020-03-01', 'FY2020'], // 1 March 2020
    ['2020-12-31', 'FY2020'], // 31 December 2020
    ['2021-02-28', 'FY2020'], // 28 February 2021
  ])(
    'CAP-037 · The fiscal year runs 1 March to the end of February (%s → %s)',
    (typed, expected) => {
      const parsed = parseTransactionDate(typed, NOW)
      if (!parsed.ok || !parsed.date) throw new Error(`expected ${typed} to parse`)
      expect(fiscalYearLabel(fiscalYear(parsed.date))).toBe(expected)
    },
  )
})
