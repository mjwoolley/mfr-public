import { describe, it, expect } from 'vitest'

import { mergeActivityFeed } from '@/lib/accounting/activityFeed'

const txn = (id: string, enteredAt: string, extra: object = {}) => ({
  id,
  enteredAt: new Date(enteredAt),
  ...extra,
})
const exp = (id: string, createdAt: string, extra: object = {}) => ({
  id,
  createdAt: new Date(createdAt),
  ...extra,
})

describe('mergeActivityFeed', () => {
  it('interleaves transactions and expenses newest-entered-first', () => {
    const transactions = [txn('t1', '2026-07-20T09:15:00Z'), txn('t2', '2026-07-01T18:00:00Z')]
    const expenses = [exp('e1', '2026-07-25T14:30:00Z'), exp('e2', '2026-07-08T08:00:00Z')]

    const feed = mergeActivityFeed(transactions, expenses)

    expect(
      feed.map((item) => (item.kind === 'transaction' ? item.transaction.id : item.expense.id)),
    ).toEqual(['e1', 't1', 'e2', 't2'])
  })

  it('sorts transactions by enteredAt, ignoring a back-dated createdAt', () => {
    // A back-dated transaction: entered today, dated weeks earlier. In an
    // audit log it sorts at the moment it was typed in, not its business date.
    const transactions = [
      txn('t1', '2026-07-30T10:00:00Z', { createdAt: new Date('2026-07-01T12:00:00Z') }),
    ]
    const expenses = [exp('e1', '2026-07-20T10:00:00Z')]

    const feed = mergeActivityFeed(transactions, expenses)

    expect(feed[0]).toMatchObject({ kind: 'transaction', date: new Date('2026-07-30T10:00:00Z') })
    expect(feed[1]).toMatchObject({ kind: 'expense' })
  })

  it('sorts expenses by createdAt, ignoring incurredAt', () => {
    // A back-entered expense: incurred July 8, typed in July 12. It sorts at
    // its entry time; the incurred date is card data, not the sort key.
    const transactions = [txn('t1', '2026-07-10T10:00:00Z')]
    const expenses = [
      exp('e1', '2026-07-12T02:14:48Z', { incurredAt: new Date('2026-07-08T00:00:00Z') }),
    ]

    const feed = mergeActivityFeed(transactions, expenses)

    expect(feed[0]).toMatchObject({ kind: 'expense', date: new Date('2026-07-12T02:14:48Z') })
    expect(feed[1]).toMatchObject({ kind: 'transaction' })
  })

  it('puts transactions before expenses on an exact timestamp tie', () => {
    // Rows that predate the enteredAt column were backfilled from createdAt,
    // so historical back-dated entries can still collide at noon UTC.
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

    expect(feed[0]).toEqual({ kind: 'expense', date: expense.createdAt, expense })
    expect(feed[1]).toEqual({ kind: 'transaction', date: transaction.enteredAt, transaction })
    expect(feed[1].kind === 'transaction' && feed[1].transaction).toBe(transaction)
  })
})
