"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type IncomeExpenseDatum = {
  year: number;
  income: number;
  expenses: number;
};

/**
 * Thin rendering wrapper — all data computation happens server-side in
 * `page.tsx`/`@/lib/ledger`/`@/lib/expenses`. This component only renders the
 * already-computed per-year `{ year, income, expenses }[]` array.
 */
export function IncomeExpenseChart({ data }: { data: IncomeExpenseDatum[] }) {
  return (
    <div className="mt-4 h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d3" />
          <XAxis dataKey="year" />
          <YAxis />
          <Tooltip formatter={(value) => `$${Number(value ?? 0).toLocaleString()}`} />
          <Legend />
          <Bar dataKey="income" name="Income" fill="#24596d" />
          <Bar dataKey="expenses" name="Expenses" fill="#b45309" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
