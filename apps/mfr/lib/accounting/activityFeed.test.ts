import { describe, it, expect } from 'vitest'

import { mergeActivityFeed } from '@/lib/accounting/activityFeed'

const txn = (id: string, createdAt: string) => ({ id, createdAt: new Date(createdAt) })
const exp = (id: string, incurredAt: string, extra: object = {}) => ({
  id,
  incurredAt: new Date(incurredAt),
  ...extra,
})

describe('mergeActivityFeed', () => {
  it('interleaves transactions and expenses newest-first', () => {
    const transactions = [txn('t1', '2026-07-20T12:00:00Z'), txn('t2', '2026-07-01T12:00:00Z')]
    const expenses = [exp('e1', '2026-07-25T12:00:00Z'), exp('e2', '2026-07-08T12:00:00Z')]

    const feed = mergeActivityFeed(transactions, expenses)

    expect(
      feed.map((item) => (item.kind === 'transaction' ? item.transaction.id : item.expense.id)),
    ).toEqual(['e1', 't1', 'e2', 't2'])
  })

  it('sorts expenses by incurredAt, ignoring any createdAt on the row', () => {
    // A back-entered expense: typed in today, incurred weeks earlier. It must
    // sit in the feed at its incurred date, not jump to the top.
    const transactions = [txn('t1', '2026-07-20T12:00:00Z')]
    const expenses = [
      exp('e1', '2026-07-08T12:00:00Z', { createdAt: new Date('2026-07-30T12:00:00Z') }),
    ]

    const feed = mergeActivityFeed(transactions, expenses)

    expect(feed[0]).toMatchObject({ kind: 'transaction' })
    expect(feed[1]).toMatchObject({ kind: 'expense', date: new Date('2026-07-08T12:00:00Z') })
  })

  it('puts transactions before expenses on an exact timestamp tie', () => {
    const noon = '2026-07-08T12:00:00Z'
    const feed = mergeActivityFeed([txn('t1', noon)], [exp('e1', noon)])

    expect(feed.map((item) => item.kind)).toEqual(['transaction', 'expense'])
  })

  it('preserves input order within a kind on ties', () => {
    const noon = '2026-07-08T12:00:00Z'
    const feed = mergeActivityFeed([], [exp('e1', noon), exp('e2', noon)])

    expect(feed.map((item) => (item.kind === 'expense' ? item.expense.id : ''))).toEqual([
      'e1',
      'e2',
    ])
  })

  it('handles empty inputs on either or both sides', () => {
    expect(mergeActivityFeed([], [])).toEqual([])

    const onlyTxns = mergeActivityFeed([txn('t1', '2026-07-01T12:00:00Z')], [])
    expect(onlyTxns).toHaveLength(1)
    expect(onlyTxns[0].kind).toBe('transaction')

    const onlyExps = mergeActivityFeed([], [exp('e1', '2026-07-01T12:00:00Z')])
    expect(onlyExps).toHaveLength(1)
    expect(onlyExps[0].kind).toBe('expense')
  })

  it('carries the original row objects through unmodified', () => {
    const transaction = txn('t1', '2026-07-01T12:00:00Z')
    const expense = exp('e1', '2026-07-02T12:00:00Z', { amount: '2104.00', category: 'TAXES' })

    const feed = mergeActivityFeed([transaction], [expense])

    expect(feed[0]).toEqual({ kind: 'expense', date: expense.incurredAt, expense })
    expect(feed[1]).toEqual({ kind: 'transaction', date: transaction.createdAt, transaction })
    expect(feed[1].kind === 'transaction' && feed[1].transaction).toBe(transaction)
  })
})
