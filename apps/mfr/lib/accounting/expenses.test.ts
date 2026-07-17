import { describe, it, expect } from 'vitest'

// getExpensesByYear (the DB fetch) is covered against a real Neon test branch by
// the integration suite; here we test the pure fiscal-year grouping/splitting/merge.
import {
  groupExpensesByYear,
  mergeIncomeAndExpenses,
  splitExpensesByYear,
} from '@/lib/accounting/expenses'
import { Decimal } from '@/lib/accounting/decimal'

describe('groupExpensesByYear', () => {
  it('groups expenses by the fiscal year of incurredAt', () => {
    const expenses = [
      { amount: new Decimal(40), incurredAt: new Date('2024-09-01') }, // FY2024
      { amount: new Decimal(10), incurredAt: new Date('2025-02-01') }, // Feb rolls back → FY2024
      { amount: new Decimal(300), incurredAt: new Date('2025-04-01') }, // FY2025
    ]

    const groups = groupExpensesByYear(expenses)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ year: 2024 })
    expect(groups[0].total.toString()).toBe('50') // 40 + the Feb-2025 entry
    expect(groups[1]).toMatchObject({ year: 2025 })
    expect(groups[1].total.toString()).toBe('300')
  })

  it('returns an empty array when there are no expenses', () => {
    expect(groupExpensesByYear([])).toEqual([])
  })
})

describe('splitExpensesByYear', () => {
  it("splits each year's total into operating vs capital by the capital flag", () => {
    const expenses = [
      { amount: new Decimal(40), incurredAt: new Date('2024-09-01'), capital: false }, // FY2024 op
      { amount: new Decimal(10), incurredAt: new Date('2024-11-01'), capital: true }, // FY2024 cap
      { amount: new Decimal(5), incurredAt: new Date('2025-02-01'), capital: true }, // Feb → FY2024 cap
      { amount: new Decimal(300), incurredAt: new Date('2025-04-01'), capital: false }, // FY2025 op
    ]

    const groups = splitExpensesByYear(expenses)

    expect(groups).toHaveLength(2)
    expect(groups[0].year).toBe(2024)
    expect(groups[0].operating.toString()).toBe('40')
    expect(groups[0].capital.toString()).toBe('15') // 10 + the Feb-2025 entry
    expect(groups[1].year).toBe(2025)
    expect(groups[1].operating.toString()).toBe('300')
    expect(groups[1].capital.toString()).toBe('0')
  })

  it('returns an empty array when there are no expenses', () => {
    expect(splitExpensesByYear([])).toEqual([])
  })
})

describe('mergeIncomeAndExpenses', () => {
  it('combines per-year income and expense totals, keyed by year', () => {
    const contributionsByYear = [
      { year: 2024, total: new Decimal(150), purchases: [] },
      { year: 2025, total: new Decimal(200), purchases: [] },
    ]
    const expensesByYear = [
      { year: 2024, total: new Decimal(50) },
      { year: 2026, total: new Decimal(20) },
    ]

    const merged = mergeIncomeAndExpenses(contributionsByYear, expensesByYear)

    expect(merged).toEqual([
      { year: 2024, income: expect.any(Decimal), expenses: expect.any(Decimal) },
      { year: 2025, income: expect.any(Decimal), expenses: expect.any(Decimal) },
      { year: 2026, income: expect.any(Decimal), expenses: expect.any(Decimal) },
    ])

    const y2024 = merged.find((m) => m.year === 2024)!
    expect(y2024.income.toString()).toBe('150')
    expect(y2024.expenses.toString()).toBe('50')

    // A year with contributions but no expenses gets a zero expense total,
    // not undefined.
    const y2025 = merged.find((m) => m.year === 2025)!
    expect(y2025.income.toString()).toBe('200')
    expect(y2025.expenses.toString()).toBe('0')

    // A year with expenses but no contributions gets a zero income total.
    const y2026 = merged.find((m) => m.year === 2026)!
    expect(y2026.income.toString()).toBe('0')
    expect(y2026.expenses.toString()).toBe('20')
  })

  it('returns an empty array when there are no contributions or expenses', () => {
    expect(mergeIncomeAndExpenses([], [])).toEqual([])
  })
})
