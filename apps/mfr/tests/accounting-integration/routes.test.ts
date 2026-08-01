import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './testDb'

import { GET as currentYear } from '@/app/accounting/api/contributions/current-year/route'
import { currentFiscalYear } from '@/lib/accounting/fiscalYear'
import { TransactionType } from '@/lib/accounting/enums'

// The one route left here is public and totals-only, so there is no session to
// mock — the admin shareholder-search route it used to sit beside was replaced
// by the link picker on the shareholder Edit page.

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
})

describe('GET /api/contributions/current-year', () => {
  it("reports the current fiscal year's raised total against the goal, cacheable", async () => {
    // Seed one contribution in the current fiscal year for a throwaway
    // shareholder; other suites may add more concurrently, so assert >=.
    const shareholder = await testDb.shareholder.create({
      data: { name: `Current Year Route ${Date.now()}`, email: null },
    })
    createdShareholderIds.push(shareholder.id)
    const transaction = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: 'admin-1',
        entries: { create: { shareholderId: shareholder.id, shares: 123 } },
      },
    })
    createdTransactionIds.push(transaction.id)

    const res = await currentYear()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('s-maxage=60')
    expect(body.year).toBe(currentFiscalYear())
    expect(body.raised).toBeGreaterThanOrEqual(123)
    // goal is either unset (null) or a configured number — both valid states.
    expect(body.goal === null || typeof body.goal === 'number').toBe(true)
  })
})
