import { requireAuthorized } from "@/lib/authz";
import { getAllShareholderBalances, getContributionsByYear } from "@/lib/ledger";
import { getIncomeExpensesByYear } from "@/lib/expenses";
import { formatUSD, formatDate } from "@/lib/format";
import { ExpenseForm } from "./expense-form";
import { IncomeExpenseChart, type IncomeExpenseDatum } from "./income-expense-chart";

export default async function ReportsPage() {
  const session = await requireAuthorized();
  const { rows, total } = await getAllShareholderBalances();
  const contributionsByYear = await getContributionsByYear();
  const incomeExpensesByYear = await getIncomeExpensesByYear(contributionsByYear);

  // Decimal isn't serializable across the server/client boundary — convert
  // to plain numbers before handing off to the 'use client' chart wrapper.
  const chartData: IncomeExpenseDatum[] = incomeExpensesByYear.map((y) => ({
    year: y.year,
    income: Number(y.income),
    expenses: Number(y.expenses),
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Reports</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Ownership report</h2>
        <p className="mt-2 text-stone-600">
          {formatUSD(total.toString())} shares outstanding across {rows.length} shareholder
          {rows.length === 1 ? "" : "s"}.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-sand-200">
                <th className="py-2">Shareholder</th>
                <th className="py-2 text-right">Shares</th>
                <th className="py-2 text-right">Ownership</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ shareholder, shares, percent }) => (
                <tr key={shareholder.id} className="border-b border-sand-100">
                  <td className="py-2">{shareholder.name}</td>
                  <td className="py-2 text-right">{formatUSD(shares.toString())}</td>
                  <td className="py-2 text-right">{percent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{formatUSD(total.toString())}</td>
                <td className="py-2 text-right">100.00%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Contributions by Year</h2>

        {contributionsByYear.length === 0 && (
          <p className="mt-2 text-stone-500">No contributions recorded yet.</p>
        )}

        <div className="mt-4 flex flex-col gap-6">
          {contributionsByYear.map((group) => (
            <div key={group.year}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium">{group.year}</h3>
                <span className="text-sm text-stone-600">
                  Total: {formatUSD(group.total.toString())}
                </span>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-sand-200">
                      <th className="py-2">Shareholder</th>
                      <th className="py-2">Date</th>
                      <th className="py-2 text-right">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.purchases.map((purchase, i) => (
                      <tr key={i} className="border-b border-sand-100">
                        <td className="py-2">{purchase.shareholderName}</td>
                        <td className="py-2">{formatDate(purchase.date)}</td>
                        <td className="py-2 text-right">
                          {formatUSD(purchase.shares.toString())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-y-3">
          <h2 className="text-lg font-semibold">Income &amp; Expenses</h2>
          {session.user.isAccountingAdmin && <ExpenseForm />}
        </div>

        {chartData.length === 0 ? (
          <p className="mt-2 text-stone-500">No income or expenses recorded yet.</p>
        ) : (
          <IncomeExpenseChart data={chartData} />
        )}
      </section>
    </div>
  );
}
