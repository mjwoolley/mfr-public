import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Decimal } from '@/lib/accounting/decimal'

// Requirements coverage for CAP-045 (requirements/accounting/corporation-expenses-report.md).
// The Expenses tab builds its year rows, net and summary inline, so it is
// rendered here against mocked contributions-by-year and expense rows. The
// DB-side filter (corrected purchases excluded) is covered by the integration
// suite (tests/accounting-integration/requirements-records-expenses.test.ts).

const { contributionsMock, expenseFindMany } = vi.hoisted(() => ({
  contributionsMock: vi.fn(),
  expenseFindMany: vi.fn(),
}))

vi.mock('@/lib/accounting/authz', () => ({ requireAuthorized: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/accounting/ledger', () => ({ getContributionsByYear: contributionsMock }))
vi.mock('@/lib/db/client', () => ({
  db: { query: { expense: { findMany: expenseFindMany } } },
}))

import ExpensesPage from './page'

let seq = 0
function expenseRow(
  incurredAt: string,
  amount: number,
  over: Partial<{ description: string; category: string; capital: boolean }> = {},
) {
  seq += 1
  return {
    id: `exp-${seq}`,
    description: over.description ?? `Expense ${seq}`,
    amount: amount.toFixed(2),
    category: over.category ?? 'REPAIRS',
    capital: over.capital ?? false,
    incurredAt: new Date(`${incurredAt}T12:00:00Z`),
    createdAt: new Date(`${incurredAt}T12:00:00Z`),
  }
}

function contributions(byYear: Record<number, number>) {
  return Object.entries(byYear).map(([year, total]) => ({
    year: Number(year),
    total: new Decimal(total),
    purchases: [],
  }))
}

async function render(opts: {
  contributions?: Record<number, number>
  // The page asks the DB for expenses newest-first; the mock returns them in
  // the order given, so tests pass them already newest-first.
  expenses?: ReturnType<typeof expenseRow>[]
}) {
  contributionsMock.mockResolvedValue(contributions(opts.contributions ?? {}))
  expenseFindMany.mockResolvedValue(opts.expenses ?? [])
  return renderToStaticMarkup(await ExpensesPage())
}

function text(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
}

/** The cells of the yearly table row whose first cell is `label`. */
function tableRow(html: string, label: string): string[] {
  const rows = html.match(/<tr[^>]*>.*?<\/tr>/g) ?? []
  const row = rows.find((r) => r.match(/<td[^>]*>(.*?)<\/td>/)?.[1] === label)
  if (!row) throw new Error(`no row ${label}`)
  return [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1])
}

function svg(html: string) {
  return html.match(/<svg.*<\/svg>/)?.[0] ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sep 26, 2026 → the current fiscal year is FY2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CAP-045 Corporation expenses report — page', () => {
  it('CAP-045 · The summary line totals spending since the first expense', async () => {
    const html = await render({
      expenses: [expenseRow('2026-05-10', 300), expenseRow('2023-06-01', 1200)],
    })

    expect(html).toContain('<h1 class="mb-2 text-4xl">Corporation expenses</h1>')
    expect(text(html)).toContain('$1,500 spent on the house since FY2023 · $300 so far in FY2026.')
  })

  it('CAP-045 · No spending yet this fiscal year', async () => {
    const html = await render({
      expenses: [expenseRow('2024-10-01', 500), expenseRow('2024-04-01', 300)],
    })

    expect(text(html)).toContain('$800 spent on the house since FY2024 · $0 so far in FY2026.')
  })

  it('CAP-045 · No expenses at all', async () => {
    const html = await render({})

    // Once as the summary line, once in the expense log.
    expect(html).toContain(
      '<p class="text-muted mb-1.5 max-w-[70ch] text-[15px]">No expenses recorded yet.</p>',
    )
    expect(html).toMatch(/<td colSpan="4" class="text-muted">No expenses recorded yet.<\/td>/)
  })

  it('CAP-045 · The fiscal-year explainer is shown', async () => {
    const html = await render({})

    expect(text(html)).toContain(
      "The corporation's fiscal year runs March 1 through the end of February — FY2026 is March 2026 through February 2027.",
    )
  })

  it('CAP-045 · The yearly table compares money in and money out', async () => {
    const html = await render({
      contributions: { 2025: 5000 },
      expenses: [expenseRow('2025-09-01', 2000, { capital: true }), expenseRow('2025-06-01', 1200)],
    })

    expect(tableRow(html, 'FY2025')).toEqual(['FY2025', '$5,000', '−$1,200', '−$2,000', '+$1,800'])
  })

  it('CAP-045 · A negative year is shown as a loss', async () => {
    const html = await render({
      contributions: { 2024: 500 },
      expenses: [expenseRow('2024-07-01', 900)],
    })

    expect(tableRow(html, 'FY2024')[4]).toBe('-$400')
  })

  it('CAP-045 · A year with only one side still gets a row', async () => {
    const html = await render({
      contributions: { 2010: 2500 },
      expenses: [expenseRow('2024-07-01', 900)],
    })

    expect(tableRow(html, 'FY2010')).toEqual(['FY2010', '$2,500', '—', '—', '+$2,500'])
    // And an expense-only year still gets a row, with $0 money in.
    expect(tableRow(html, 'FY2024')).toEqual(['FY2024', '$0', '−$900', '—', '-$900'])
  })

  it('CAP-045 · The yearly table covers the full history with an all-time total', async () => {
    const html = await render({
      contributions: { 1995: 10000, 2003: 4000, 2025: 5000 },
      expenses: [
        expenseRow('2025-09-01', 2000, { capital: true }),
        expenseRow('2025-06-01', 1200),
        expenseRow('2003-06-01', 300),
      ],
    })

    const years = [...html.matchAll(/<td class="font-semibold">(FY\d{4})<\/td>/g)].map((m) => m[1])
    expect(years).toEqual(['FY1995', 'FY2003', 'FY2025'])

    const tfoot = html.match(/<tfoot>.*?<\/tfoot>/)![0]
    const cells = [...tfoot.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1])
    expect(cells).toEqual(['All-time', '$19,000', '−$1,500', '−$2,000', '+$15,500'])
    // The All-time row is the table's last row.
    const firstTable = html.match(/<table class="table table-fixed.*?<\/table>/)![0]
    expect(firstTable.lastIndexOf('<tr')).toBe(
      firstTable.indexOf('<tr', firstTable.indexOf('<tfoot')),
    )
  })

  it('CAP-045 · The chart shows recent years only', async () => {
    const byYear: Record<number, number> = {}
    for (let y = 1995; y <= 2026; y++) byYear[y] = 1000
    const html = await render({ contributions: byYear })

    expect(html).toContain('Income vs. expenses by year')
    const chart = svg(html)
    const charted = [...chart.matchAll(/<title>(FY\d{4}) · Share purchases in/g)].map((m) => m[1])
    expect(charted).toEqual(['FY2020', 'FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026'])
    // Earlier years are still in the table.
    expect(tableRow(html, 'FY1995')[1]).toBe('$1,000')
    expect(tableRow(html, 'FY2019')[1]).toBe('$1,000')
  })

  it("CAP-045 · The chart's running line starts at FY2020", async () => {
    const html = await render({
      contributions: { 2015: 40000, 2020: 1000 },
      expenses: [expenseRow('2021-06-01', 300)],
    })

    const chart = svg(html)
    const cumulative = [
      ...chart.matchAll(/<title>(FY\d{4} · Cumulative change: [^<]+)<\/title>/g),
    ].map((m) => m[1])
    // The $40,000 from FY2015 is not carried into the line.
    expect(cumulative).toEqual([
      'FY2020 · Cumulative change: +$1,000',
      'FY2021 · Cumulative change: +$700',
    ])
  })

  it('CAP-045 · Hovering a bar shows its exact figure', async () => {
    const html = await render({ expenses: [expenseRow('2024-07-01', 1234)] })

    expect(svg(html)).toContain('<title>FY2024 · Operating expenses: $1,234</title>')
  })

  it('CAP-045 · The chart is left out when there is nothing recent to plot', async () => {
    const html = await render({
      contributions: { 2018: 3000 },
      expenses: [expenseRow('2019-07-01', 500)],
    })

    expect(html).not.toContain('Income vs. expenses by year')
    expect(html).not.toContain('<svg')
    expect(tableRow(html, 'FY2018')[1]).toBe('$3,000')
    expect(tableRow(html, 'FY2019')[2]).toBe('−$500')
  })

  it('CAP-045 · The expense log lists every expense, latest-dated first', async () => {
    const html = await render({
      expenses: [
        expenseRow('2026-06-02', 12000, {
          description: 'New roof',
          category: 'IMPROVEMENTS',
          capital: true,
        }),
        expenseRow('2026-03-15', 250, { description: 'Gutter repair', category: 'REPAIRS' }),
      ],
    })

    const log = html.slice(html.indexOf('Expense log'))
    const rows = [...log.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => text(m[1]).trim())
    expect(rows).toEqual([
      'Date Description Category Amount',
      'Jun 2, 2026 New roof Improvements Capital $12,000',
      'Mar 15, 2026 Gutter repair Repairs $250',
    ])
    expect(log).toMatch(/Total spent.*\$12,250/)
  })
})
