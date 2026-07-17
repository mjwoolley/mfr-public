// Expenses tab (all authorized users): income-vs-expenses combo chart over
// recent fiscal years, the full per-year net table, and the raw expense log.
// Assembles the union of contribution years and expense years so a year with
// only one side still gets a row.

import { requireAuthorized } from '@/lib/accounting/authz'
import { db } from '@/lib/db/client'
import { expense } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { getContributionsByYear } from '@/lib/accounting/ledger'
import { splitExpensesByYear } from '@/lib/accounting/expenses'
import type { YearFinancials } from '@/lib/accounting/expenseChart'
import { currentFiscalYear, fiscalYearLabel } from '@/lib/accounting/fiscalYear'
import { formatDate } from '@/lib/accounting/format'
import { expenseCategoryTag } from '@/lib/accounting/tags'
import { IncomeExpenseChart } from './income-expense-chart'
import { FiscalYearNote } from '@/components/accounting/FiscalYearNote'

const usd0 = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

const negUsd = (n: number) => (n ? `−${usd0(n)}` : '—')
const signed = (n: number) => (n >= 0 ? '+' : '') + usd0(n)

// The chart starts at FY2020 so the recent operating picture stays legible;
// decades of founding-era contributions live in the table below instead.
const CHART_START_FISCAL_YEAR = 2020

export default async function ExpensesPage() {
  await requireAuthorized()

  const [contributionsByYear, expenses] = await Promise.all([
    getContributionsByYear(),
    db.query.expense.findMany({ orderBy: [desc(expense.incurredAt)] }),
  ])

  const expenseSplit = splitExpensesByYear(expenses)

  // Union of contribution years and expense years → the chart/table input.
  const contribByYear = new Map(contributionsByYear.map((g) => [g.year, Number(g.total)]))
  const splitByYear = new Map(expenseSplit.map((g) => [g.year, g]))
  const allYears = Array.from(new Set([...contribByYear.keys(), ...splitByYear.keys()])).sort(
    (a, b) => a - b,
  )
  const data: YearFinancials[] = allYears.map((year) => ({
    year,
    contributions: contribByYear.get(year) ?? 0,
    operating: Number(splitByYear.get(year)?.operating ?? 0),
    capital: Number(splitByYear.get(year)?.capital ?? 0),
  }))

  // The chart shows recent fiscal years only; the cumulative line re-bases
  // there too (it accumulates over the years shown). The table keeps the
  // full history.
  const chartData = data.filter((y) => y.year >= CHART_START_FISCAL_YEAR)

  const totalIncome = data.reduce((sum, y) => sum + y.contributions, 0)
  const totalOperating = data.reduce((sum, y) => sum + y.operating, 0)
  const totalCapital = data.reduce((sum, y) => sum + y.capital, 0)
  const totalExpense = totalOperating + totalCapital
  const totalNet = totalIncome - totalExpense

  const thisFY = currentFiscalYear()
  const expenseYears = expenseSplit.map((g) => g.year)
  const thisYearSplit = splitByYear.get(thisFY)
  const thisYearExpenses = thisYearSplit
    ? Number(thisYearSplit.operating) + Number(thisYearSplit.capital)
    : 0
  const summary =
    expenseYears.length === 0
      ? 'No expenses recorded yet.'
      : `${usd0(totalExpense)} spent on the house since ${fiscalYearLabel(Math.min(...expenseYears))} · ${usd0(thisYearExpenses)} so far in ${fiscalYearLabel(thisFY)}.`

  return (
    <div>
      <h1 className="mb-2 text-4xl">Corporation expenses</h1>
      <p className="text-muted mb-1.5 max-w-[70ch] text-[15px]">{summary}</p>
      <FiscalYearNote />

      {chartData.length > 0 && (
        <div className="card elev-sm mb-6 bg-white px-6 py-6">
          <h2 className="mb-1 text-xl">Income vs. expenses by year</h2>
          <IncomeExpenseChart data={chartData} />
        </div>
      )}

      {data.length > 0 && (
        <div className="card elev-sm mb-8 bg-white px-5 pt-2 pb-1">
          <div className="overflow-x-auto">
            <table className="table table-fixed min-w-[560px]">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '20.5%' }} />
                <col style={{ width: '20.5%' }} />
                <col style={{ width: '20.5%' }} />
                <col style={{ width: '20.5%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Fiscal year</th>
                  <th className="num">Contributions in</th>
                  <th className="num">Operating out</th>
                  <th className="num">Capital investment</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.map((y) => {
                  const net = y.contributions - y.operating - y.capital
                  return (
                    <tr key={y.year}>
                      <td className="font-semibold">{fiscalYearLabel(y.year)}</td>
                      <td className="num" style={{ color: 'var(--color-accent-2-800)' }}>
                        {usd0(y.contributions)}
                      </td>
                      <td className="num" style={{ color: 'var(--color-accent-800)' }}>
                        {negUsd(y.operating)}
                      </td>
                      <td className="num" style={{ color: 'var(--color-accent-900)' }}>
                        {negUsd(y.capital)}
                      </td>
                      <td
                        className="num font-bold"
                        style={{
                          color: net >= 0 ? 'var(--color-accent-2-800)' : 'var(--color-accent-800)',
                        }}
                      >
                        {signed(net)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontFamily: 'var(--font-heading)' }}>
                  <td className="pt-3">All-time</td>
                  <td className="num pt-3">{usd0(totalIncome)}</td>
                  <td className="num pt-3">−{usd0(totalOperating)}</td>
                  <td className="num pt-3">−{usd0(totalCapital)}</td>
                  <td
                    className="num pt-3"
                    style={{
                      color:
                        totalNet >= 0 ? 'var(--color-accent-2-800)' : 'var(--color-accent-800)',
                    }}
                  >
                    {signed(totalNet)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <h2 className="mb-3.5 text-[22px]">Expense log</h2>
      <div className="card elev-sm bg-white px-5 pt-2 pb-1">
        <div className="overflow-x-auto">
          <table className="table min-w-[560px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((x) => {
                const cat = expenseCategoryTag(x.category)
                return (
                  <tr key={x.id}>
                    <td className="text-muted whitespace-nowrap">{formatDate(x.incurredAt)}</td>
                    <td>{x.description}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cat.className}>{cat.label}</span>
                        {x.capital && (
                          <span className="tag tag-outline px-[7px] py-0 text-[10px]">Capital</span>
                        )}
                      </span>
                    </td>
                    <td
                      className="text-right font-semibold"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {usd0(Number(x.amount))}
                    </td>
                  </tr>
                )
              })}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No expenses recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ fontFamily: 'var(--font-heading)' }}>
                <td className="pt-3" colSpan={3}>
                  Total spent
                </td>
                <td className="pt-3 text-right">{usd0(totalExpense)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
