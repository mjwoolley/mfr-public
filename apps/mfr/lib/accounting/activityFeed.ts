/**
 * Merges share transactions and house expenses into the single chronological
 * feed the admin Activity tab renders. Pure and generic over the row shapes —
 * the same fetch-then-compute split as groupExpensesByYear in
 * @/lib/accounting/expenses — so the interleaving is unit-testable without a
 * database.
 *
 * The feed is an audit log: it orders by when each row was *entered*, not by
 * its business date. For transactions that means `enteredAt` — `createdAt`
 * can't serve because back-dating writes the chosen business day into it (see
 * @/lib/accounting/transactionDate). For expenses it means `createdAt`, the
 * insert timestamp; `incurredAt` is the business date. The business dates
 * still appear on the cards as data.
 */

export type ActivityFeedItem<T, E> =
  { kind: 'transaction'; date: Date; transaction: T } | { kind: 'expense'; date: Date; expense: E }

export function mergeActivityFeed<T extends { enteredAt: Date }, E extends { createdAt: Date }>(
  transactions: T[],
  expenses: E[],
): ActivityFeedItem<T, E>[] {
  const items: ActivityFeedItem<T, E>[] = [
    ...transactions.map((t) => ({
      kind: 'transaction' as const,
      date: t.enteredAt,
      transaction: t,
    })),
    ...expenses.map((e) => ({ kind: 'expense' as const, date: e.createdAt, expense: e })),
  ]
  // Newest first. Rows that predate the enteredAt column were backfilled from
  // createdAt, so historical back-dated entries can still tie at noon UTC: put
  // the transaction before the expense so the order is deterministic, and rely
  // on sort stability to keep each side's own DB order otherwise.
  return items.sort((a, b) => {
    const diff = b.date.getTime() - a.date.getTime()
    if (diff !== 0) return diff
    if (a.kind === b.kind) return 0
    return a.kind === 'transaction' ? -1 : 1
  })
}
