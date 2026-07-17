// Expense aggregation for the Expenses tab: fiscal-year grouping, the
// operating-vs-capital split, and the income-vs-expenses merge that feeds the
// combo chart. All grouping is pure and keyed by fiscal year (Mar–Feb, see
// @/lib/fiscalYear) — `year` fields hold fiscal years throughout.

import { prisma } from "@/lib/accounting/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { ContributionYearGroup } from "@/lib/accounting/ledger";
import { fiscalYear } from "@/lib/accounting/fiscalYear";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

export type ExpenseYearGroup = {
  year: number;
  total: Decimal;
};

type ExpenseForGrouping = {
  amount: Decimal;
  incurredAt: Date;
};

/**
 * Groups Expense rows by the fiscal year of `incurredAt` (see
 * @/lib/fiscalYear). Pure/synchronous, same fetch-then-group-in-JS pattern as
 * `groupContributionsByYear` in `@/lib/ledger` — Prisma's `groupBy` can't
 * extract a year from a DateTime column directly either, so there's no
 * query-layer shortcut here. The `year` field holds the fiscal year.
 */
export function groupExpensesByYear(expenses: ExpenseForGrouping[]): ExpenseYearGroup[] {
  const byYear = new Map<number, ExpenseYearGroup>();

  for (const expense of expenses) {
    const year = fiscalYear(expense.incurredAt);
    let group = byYear.get(year);
    if (!group) {
      group = { year, total: new Decimal(0) };
      byYear.set(year, group);
    }
    group.total = group.total.add(expense.amount);
  }

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

export async function getExpensesByYear(): Promise<ExpenseYearGroup[]> {
  const expenses = await prisma.expense.findMany();
  return groupExpensesByYear(expenses);
}

export type ExpenseSplitYearGroup = {
  year: number;
  operating: Decimal;
  capital: Decimal;
};

type ExpenseForSplitting = ExpenseForGrouping & { capital: boolean };

/**
 * Groups expenses by fiscal year of `incurredAt` (see @/lib/fiscalYear),
 * split into operating vs capital (the per-expense `capital` flag,
 * independent of category) — the shape the Expenses tab's stacked bars and
 * net table consume. The `year` field holds the fiscal year.
 */
export function splitExpensesByYear(expenses: ExpenseForSplitting[]): ExpenseSplitYearGroup[] {
  const byYear = new Map<number, ExpenseSplitYearGroup>();

  for (const expense of expenses) {
    const year = fiscalYear(expense.incurredAt);
    let group = byYear.get(year);
    if (!group) {
      group = { year, operating: new Decimal(0), capital: new Decimal(0) };
      byYear.set(year, group);
    }
    if (expense.capital) {
      group.capital = group.capital.add(expense.amount);
    } else {
      group.operating = group.operating.add(expense.amount);
    }
  }

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

export type IncomeExpenseYear = {
  year: number;
  income: Decimal;
  expenses: Decimal;
};

/**
 * Merges an already-computed per-year contribution total (income) with
 * per-year expense totals. Takes `contributionsByYear` as an argument rather
 * than recomputing it — the Reports page fetches contributions once for the
 * "Contributions by Year" section and passes the same result in here, so
 * income figures aren't derived via a second, separate aggregation.
 */
export function mergeIncomeAndExpenses(
  contributionsByYear: ContributionYearGroup[],
  expensesByYear: ExpenseYearGroup[],
): IncomeExpenseYear[] {
  const years = new Set<number>([
    ...contributionsByYear.map((c) => c.year),
    ...expensesByYear.map((e) => e.year),
  ]);

  return Array.from(years)
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      income: contributionsByYear.find((c) => c.year === year)?.total ?? new Decimal(0),
      expenses: expensesByYear.find((e) => e.year === year)?.total ?? new Decimal(0),
    }));
}

export async function getIncomeExpensesByYear(
  contributionsByYear: ContributionYearGroup[],
): Promise<IncomeExpenseYear[]> {
  const expensesByYear = await getExpensesByYear();
  return mergeIncomeAndExpenses(contributionsByYear, expensesByYear);
}
