import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'

// Standard preamble — see shareholders.test.ts for the reasoning.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { auth } from '@/lib/auth'
import { testDb } from './testDb'
import { createContribution } from '@/actions/accounting/contributions'
import { createTransfer } from '@/actions/accounting/transfers'
import { db } from '@/lib/db/client'
import { transaction, ledgerEntry, transactionApproval } from '@/lib/db/schema'
import { getContributionsByYear } from '@/lib/accounting/ledger'
import { fiscalYear, currentFiscalYear } from '@/lib/accounting/fiscalYear'

const ADMIN_SESSION = {
  user: {
    id: 'admin-dates',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: true },
    shareholderId: null,
    email: 'admin@example.com',
    name: 'Admin',
  },
  expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const createdShareholderIds: string[] = []
const createdTransactionIds: string[] = []

/** Transactions this suite created, newest first. */
async function ownTransactions() {
  const rows = await db.query.transaction.findMany({
    where: eq(transaction.createdById, ADMIN_SESSION.user.id),
    with: { entries: true, approvals: true },
  })
  for (const r of rows) if (!createdTransactionIds.includes(r.id)) createdTransactionIds.push(r.id)
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

async function makeShareholder(name: string) {
  const row = await testDb.shareholder.create({
    data: { name: `${name} ${Date.now()}-${Math.random()}` },
  })
  createdShareholderIds.push(row.id)
  return row
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  // Transactions first: LedgerEntry -> Shareholder is ON DELETE RESTRICT.
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {})
  }
  createdTransactionIds.length = 0
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
})

describe('back-dating a share purchase', () => {
  it('stores the entered date and reaches the real by-year report in that fiscal year', async () => {
    const sh = await makeShareholder('Backdated')

    const result = await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '100', date: '2019-06-15', inKind: 'false' }),
    )
    expect(result?.error).toBeUndefined()

    const [t] = await ownTransactions()
    expect(t.createdAt.toISOString()).toBe('2019-06-15T12:00:00.000Z')
    expect(fiscalYear(t.createdAt)).toBe(2019)

    // Not just the row — the report the family actually reads.
    const byYear = await getContributionsByYear()
    const fy2019 = byYear.find((g) => g.year === 2019)
    expect(fy2019).toBeDefined()
    expect(fy2019!.purchases.some((p) => p.shareholderId === sh.id)).toBe(true)
  })

  // The fiscal year runs Mar 1 – end of Feb, which is where a back-dating
  // admin will slip. These are the two days either side of the boundary.
  it('puts the last day of February in the previous fiscal year', async () => {
    const sh = await makeShareholder('Feb Boundary')
    await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '10', date: '2020-02-29', inKind: 'false' }),
    )

    const [t] = await ownTransactions()
    expect(fiscalYear(t.createdAt)).toBe(2019)
  })

  it('puts March 1 in the new fiscal year', async () => {
    const sh = await makeShareholder('Mar Boundary')
    await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '10', date: '2020-03-01', inKind: 'false' }),
    )

    const [t] = await ownTransactions()
    expect(fiscalYear(t.createdAt)).toBe(2020)
  })

  it('buckets a back-dated purchase and a current one into different fiscal years', async () => {
    const sh = await makeShareholder('Two Years')

    await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '500', date: '2019-06-15', inKind: 'false' }),
    )
    // A control row with no date lands in the current fiscal year.
    await createContribution(undefined, fd({ shareholderId: sh.id, amount: '7', inKind: 'false' }))
    await ownTransactions()

    // Scoped to this shareholder rather than comparing global totals: the
    // accounting-integration files run in parallel and write to the same
    // branch, so any suite-wide sum is racy (see libDb.test.ts).
    const byYear = await getContributionsByYear()
    const mine = (year: number) =>
      byYear
        .find((g) => g.year === year)
        ?.purchases.filter((p) => p.shareholderId === sh.id)
        .reduce((sum, p) => sum + Number(p.shares), 0) ?? 0

    expect(mine(2019)).toBe(500)
    expect(mine(currentFiscalYear())).toBe(7)
  })

  it("dates the ledger entry and approval with the transaction's date, not today", async () => {
    const sh = await makeShareholder('Row Dates')
    await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '25', date: '2019-06-15', inKind: 'false' }),
    )

    const [t] = await ownTransactions()
    const entries = await db.query.ledgerEntry.findMany({
      where: eq(ledgerEntry.transactionId, t.id),
    })
    const approvals = await db.query.transactionApproval.findMany({
      where: eq(transactionApproval.transactionId, t.id),
    })

    expect(entries[0].createdAt.toISOString()).toBe(t.createdAt.toISOString())
    expect(approvals[0].createdAt.toISOString()).toBe(t.createdAt.toISOString())
  })

  it('leaves createdAt to the database when no date is given', async () => {
    const sh = await makeShareholder('No Date')
    await createContribution(undefined, fd({ shareholderId: sh.id, amount: '5', inKind: 'false' }))

    const [t] = await ownTransactions()
    expect(Math.abs(Date.now() - t.createdAt.getTime())).toBeLessThan(60_000)
    expect(fiscalYear(t.createdAt)).toBe(currentFiscalYear())
  })
})

describe('back-dating a transfer', () => {
  it('dates the transaction, both ledger rows and both approvals', async () => {
    const from = await makeShareholder('Transfer From')
    const to = await makeShareholder('Transfer To')
    await createContribution(
      undefined,
      fd({ shareholderId: from.id, amount: '100', inKind: 'false' }),
    )

    const result = await createTransfer(
      undefined,
      fd({
        fromShareholderId: from.id,
        toShareholderId: to.id,
        amount: '40',
        description: 'back-dated transfer',
        date: '2019-06-15',
      }),
    )
    expect(result?.error).toBeUndefined()

    const transfer = (await ownTransactions()).find((t) => t.type === 'TRANSFER')!
    expect(transfer.createdAt.toISOString()).toBe('2019-06-15T12:00:00.000Z')
    expect(transfer.entries).toHaveLength(2)
    for (const e of transfer.entries) {
      expect(e.createdAt.toISOString()).toBe(transfer.createdAt.toISOString())
    }
    for (const a of transfer.approvals) {
      expect(a.createdAt.toISOString()).toBe(transfer.createdAt.toISOString())
    }
  })
})

describe('rejected dates write nothing', () => {
  it('rejects a future date and leaves the ledger untouched', async () => {
    const sh = await makeShareholder('Future')
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)

    const result = await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '50', date: future, inKind: 'false' }),
    )

    expect(result?.error).toMatch(/future/i)
    expect(await ownTransactions()).toHaveLength(0)
  })

  it('rejects a malformed date and leaves the ledger untouched', async () => {
    const sh = await makeShareholder('Malformed')

    const result = await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '50', date: '2019-02-31', inKind: 'false' }),
    )

    expect(result?.error).toMatch(/valid date/i)
    expect(await ownTransactions()).toHaveLength(0)
  })
})
