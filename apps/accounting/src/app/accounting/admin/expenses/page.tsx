import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { expenseCategoryTag } from "@/lib/tags";
import { ExpensesAdminClient, type ExpenseRow } from "./expenses-client";

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default async function AdminExpensesPage() {
  const expenses = await prisma.expense.findMany({ orderBy: { incurredAt: "desc" } });

  const rows: ExpenseRow[] = expenses.map((x) => {
    const cat = expenseCategoryTag(x.category);
    return {
      id: x.id,
      description: x.description,
      amount: Number(x.amount),
      amountFmt: usd0(Number(x.amount)),
      category: x.category,
      categoryLabel: cat.label,
      categoryClassName: cat.className,
      capital: x.capital,
      dateFmt: formatDate(x.incurredAt),
    };
  });

  return <ExpensesAdminClient rows={rows} />;
}
