// Admin expenses view (server half): fetches and pre-formats expense rows,
// then hands everything to the client component that owns the CRUD dialogs.

import { db } from '@/lib/db/client'
import { expense } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { formatDate } from '@/lib/accounting/format'
import { expenseCategoryTag } from '@/lib/accounting/tags'
import { ExpensesAdminClient, type ExpenseRow } from './expenses-client'

const usd0 = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

export default async function AdminExpensesPage() {
  const expenses = await db.query.expense.findMany({
    orderBy: [desc(expense.incurredAt)],
  })

  const rows: ExpenseRow[] = expenses.map((x) => {
    const cat = expenseCategoryTag(x.category)
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
    }
  })

  return <ExpensesAdminClient rows={rows} />
}
