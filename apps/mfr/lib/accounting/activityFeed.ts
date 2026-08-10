/**
 * Merges share transactions and house expenses into the single chronological
 * feed the admin Activity tab renders. Pure and generic over the row shapes —
 * the same fetch-then-compute split as groupExpensesByYear in
 * @/lib/accounting/expenses — so the interleaving is unit-testable without a
 * database.
 *
 * Each side sorts by its *effective* date: `transaction.createdAt` IS the
 * transaction date (back-dating writes the entered day into it — see
 * @/lib/accounting/transactionDate), and `expense.incurredAt` plays the same
 * role for expenses. Sorting an expense by its row-creation time instead would
 * shuffle the feed against the dates the cards display.
 */

export type ActivityFeedItem<T, E> =
  { kind: 'transaction'; date: Date; transaction: T } | { kind: 'expense'; date: Date; expense: E }

export function mergeActivityFeed<T extends { createdAt: Date }, E extends { incurredAt: Date }>(
  transactions: T[],
  expenses: E[],
): ActivityFeedItem<T, E>[] {
  const items: ActivityFeedItem<T, E>[] = [
    ...transactions.map((t) => ({
      kind: 'transaction' as const,
      date: t.createdAt,
      transaction: t,
    })),
    ...expenses.map((e) => ({ kind: 'expense' as const, date: e.incurredAt, expense: e })),
  ]
  // Newest first. Ties are real (back-dated rows all land at noon UTC): put
  // the transaction before the expense so the order is deterministic, and rely
  // on sort stability to keep each side's own DB order otherwise.
  return items.sort((a, b) => {
    const diff = b.date.getTime() - a.date.getTime()
    if (diff !== 0) return diff
    if (a.kind === b.kind) return 0
    return a.kind === 'transaction' ? -1 : 1
  })
}
