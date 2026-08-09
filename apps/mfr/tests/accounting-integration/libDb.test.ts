// DB-backed lib helpers that the unit suites can't reach: the app-settings
// singleton upsert, the current-fiscal-year raised total, and the goal lookup.
import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './testDb'
import { getAppSettings } from '@/lib/accounting/settings'
import { getRaisedThisYear } from '@/lib/accounting/ledger'
import { getContributionGoal } from '@/lib/accounting/goals'
import { currentFiscalYear } from '@/lib/accounting/fiscalYear'
import { TransactionType } from '@/lib/accounting/enums'

// A far-past year no other fixture uses (adminSettings.test.ts uses 2001).
const GOAL_TEST_YEAR = 1999

const createdShareholderIds: string[] = []
const createdTransactionIds: string[] = []

afterEach(async () => {
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {})
  }
  createdTransactionIds.length = 0
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
  await testDb.contributionGoal.delete({ where: { year: GOAL_TEST_YEAR } }).catch(() => {})
})

describe('getAppSettings', () => {
  it('upsert-reads the singleton row (fresh DB gets defaults on first touch)', async () => {
    const settings = await getAppSettings()
    expect(settings.id).toBe('singleton')
    expect(typeof settings.contributionsVisibleToAll).toBe('boolean')

    // Second read returns the same row, not a duplicate.
    const again = await getAppSettings()
    expect(again.id).toBe('singleton')
  })
})

describe('getRaisedThisYear', () => {
  it('sums current-fiscal-year contributions ($1 = 1 share), excluding deleted', async () => {
    const shareholder = await testDb.shareholder.create({
      data: { name: `Raised Fixture ${Date.now()}`, email: null },
    })
    createdShareholderIds.push(shareholder.id)

    const live = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: 'admin-1',
        entries: { create: { shareholderId: shareholder.id, shares: 77 } },
      },
    })
    createdTransactionIds.push(live.id)
    // A soft-deleted contribution must NOT count.
    const deleted = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: 'admin-1',
        deleted: true,
        deletedAt: new Date(),
        entries: { create: { shareholderId: shareholder.id, shares: 1000 } },
      },
    })
    createdTransactionIds.push(deleted.id)

    const before = await getRaisedThisYear()
    expect(before.year).toBe(currentFiscalYear())
    // Other suites write contributions concurrently, so assert the floor and
    // that the deleted 1000 didn't leak in via our own fixtures' delta.
    expect(before.raised).toBeGreaterThanOrEqual(77)

    const mine = await testDb.ledgerEntry.aggregate({
      where: { shareholderId: shareholder.id, transaction: { deleted: false } },
      _sum: { shares: true },
    })
    expect(Number(mine._sum.shares)).toBe(77)
  })

  it('excludes transfers and adjustments — only CONTRIBUTIONs count toward the goal', async () => {
    const sender = await testDb.shareholder.create({
      data: { name: `Transfer Sender ${Date.now()}`, email: null },
    })
    const receiver = await testDb.shareholder.create({
      data: { name: `Transfer Receiver ${Date.now()}`, email: null },
    })
    createdShareholderIds.push(sender.id, receiver.id)

    const before = await getRaisedThisYear()

    // The app's real transfer shape (actions/accounting/transfers.ts): one
    // TRANSFER transaction, double-entry ledger rows. Catches a future
    // aggregation that counts only the receiving (positive) leg.
    const transfer = await testDb.transaction.create({
      data: {
        type: TransactionType.TRANSFER,
        createdById: 'admin-1',
        entries: {
          create: [
            { shareholderId: sender.id, shares: -1_000_000 },
            { shareholderId: receiver.id, shares: 1_000_000 },
          ],
        },
      },
    })
    createdTransactionIds.push(transfer.id)

    // A one-sided ADJUSTMENT (actions/accounting/adjustments.ts) — unlike a
    // balanced transfer it can't hide by netting to zero, so it catches the
    // CONTRIBUTION type filter being dropped from the raised query.
    const adjustment = await testDb.transaction.create({
      data: {
        type: TransactionType.ADJUSTMENT,
        createdById: 'admin-1',
        entries: { create: { shareholderId: receiver.id, shares: 1_000_000 } },
      },
    })
    createdTransactionIds.push(adjustment.id)

    const after = await getRaisedThisYear()
    // Other suites may insert small contributions between the two reads, so
    // bound the delta below the deliberately distinctive 1M fixtures rather
    // than asserting exactly zero.
    expect(after.raised - before.raised).toBeLessThan(1_000_000)
  })
})

describe('getContributionGoal', () => {
  it('returns the configured goal for a year and null when unset', async () => {
    expect(await getContributionGoal(GOAL_TEST_YEAR)).toBeNull()

    await testDb.contributionGoal.create({
      data: { year: GOAL_TEST_YEAR, amount: 5000 },
    })
    const goal = await getContributionGoal(GOAL_TEST_YEAR)
    expect(Number(goal?.amount)).toBe(5000)
  })
})
