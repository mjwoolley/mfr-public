import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { testDb } from './testDb'
import { TransactionType } from '@/lib/accounting/enums'

// Requirements coverage for CAP-044 (expense-log.md) and CAP-045
// (corporation-expenses-report.md) against the real test DB. Same mocking
// rationale as reports.test.ts.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@/lib/auth'
import { createExpense, updateExpense, deleteExpense } from '@/actions/accounting/expenses'
import AdminExpensesPage from '@/app/accounting/admin/expenses/page'
import ExpensesPage from '@/app/accounting/expenses/page'
import type { ExpenseRow } from '@/app/accounting/admin/expenses/expenses-client'

const ADMIN_SESSION = {
  user: {
    id: 'admin-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: true },
    shareholderId: null,
    email: 'admin@example.com',
    name: 'Admin',
  },
  expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const NON_ADMIN_SESSION = {
  user: {
    id: 'member-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
    shareholderId: null,
    email: 'member@example.com',
    name: 'Not An Admin',
  },
  expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

function uniq() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const createdExpenseIds: string[] = []
const createdTransactionIds: string[] = []
const createdShareholderIds: string[] = []

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const id of createdExpenseIds) {
    await testDb.expense.delete({ where: { id } }).catch(() => {})
  }
  createdExpenseIds.length = 0
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {})
  }
  createdTransactionIds.length = 0
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
})

async function seedExpense(data: {
  description: string
  amount: number
  incurredAt: Date
  category?: string
  capital?: boolean
}) {
  const row = await testDb.expense.create({
    data: {
      category: 'REPAIRS',
      capital: false,
      createdByUserId: 'admin-1',
      updatedAt: new Date(),
      ...data,
    },
  })
  createdExpenseIds.push(row.id)
  return row
}

describe('CAP-044 Expense log — real DB', () => {
  it('CAP-044 · Amount must be at least one cent — 0.01 is recorded', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const description = `One cent ${uniq()}`

    const result = await createExpense(
      undefined,
      fd({ description, amount: '0.01', category: 'OTHER', incurredAt: '2026-09-01' }),
    )

    expect(result).toEqual({ success: true })
    const row = await testDb.expense.findFirst({ where: { description } })
    createdExpenseIds.push(row!.id)
    expect(row!.amount.toString()).toBe('0.01')
  })

  it('CAP-044 · Amount must be at least one cent — -25 is refused and nothing is saved', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const description = `Negative ${uniq()}`

    const result = await createExpense(
      undefined,
      fd({ description, amount: '-25', category: 'OTHER', incurredAt: '2026-09-01' }),
    )

    expect(result).toEqual({ error: 'Amount must be greater than zero' })
    expect(await testDb.expense.findFirst({ where: { description } })).toBeNull()
  })

  it("CAP-044 · An expense's date can't be changed by editing — a submitted date is ignored", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const seeded = await seedExpense({
      description: `Dated ${uniq()}`,
      amount: 100,
      incurredAt: new Date('2026-02-27T12:00:00Z'),
    })

    const result = await updateExpense(
      seeded.id,
      undefined,
      fd({
        description: seeded.description,
        amount: '120',
        category: 'REPAIRS',
        incurredAt: '2026-03-02',
      }),
    )

    expect(result).toEqual({ success: true })
    const after = await testDb.expense.findUnique({ where: { id: seeded.id } })
    expect(after!.incurredAt.toISOString()).toBe('2026-02-27T12:00:00.000Z')
    expect(after!.amount.toString()).toBe('120')
  })

  it('CAP-044 · The expense history lists the latest-dated expenses first', async () => {
    const token = uniq()
    // Recorded in the opposite order to their dates.
    const jan = await seedExpense({
      description: `Jan ${token}`,
      amount: 84.5,
      incurredAt: new Date('2026-01-05T12:00:00Z'),
    })
    const aug = await seedExpense({
      description: `Aug ${token}`,
      amount: 200,
      incurredAt: new Date('2026-08-20T12:00:00Z'),
    })

    const element = await AdminExpensesPage()
    const rows = (element.props as { rows: ExpenseRow[] }).rows.filter((r) =>
      [jan.id, aug.id].includes(r.id),
    )

    expect(rows.map((r) => [r.description, r.dateFmt, r.amountFmt])).toEqual([
      [`Aug ${token}`, 'Aug 20, 2026', '$200'],
      [`Jan ${token}`, 'Jan 5, 2026', '$85'],
    ])
  })

  it('CAP-044 · Only accounting admins can record expenses — a non-admin cannot delete one', async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
    const seeded = await seedExpense({
      description: `Keep me ${uniq()}`,
      amount: 50,
      incurredAt: new Date('2026-05-01T12:00:00Z'),
    })

    const err = await deleteExpense(seeded.id, undefined, new FormData()).then(
      () => null,
      (e: { digest?: string }) => e,
    )

    expect(String(err?.digest).split(';')[2]).toBe('/accounting/unauthorized')
    expect(await testDb.expense.findUnique({ where: { id: seeded.id } })).not.toBeNull()
  })
})

describe('CAP-045 Corporation expenses report — real DB', () => {
  it('CAP-045 · The expense log lists every expense, latest-dated first', async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
    const token = uniq()
    await seedExpense({
      description: `Gutters ${token}`,
      amount: 250,
      incurredAt: new Date('2026-03-15T12:00:00Z'),
    })
    await seedExpense({
      description: `New roof ${token}`,
      amount: 12000,
      incurredAt: new Date('2026-06-02T12:00:00Z'),
      category: 'IMPROVEMENTS',
      capital: true,
    })

    const html = renderToStaticMarkup(await ExpensesPage())

    const roof = html.indexOf(`New roof ${token}`)
    const gutters = html.indexOf(`Gutters ${token}`)
    expect(roof).toBeGreaterThan(-1)
    expect(gutters).toBeGreaterThan(roof)
  })

  it("CAP-045 · Corrected share purchases don't count as money in", async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
    const holder = await testDb.shareholder.create({
      data: { name: `Report Holder ${uniq()}`, email: null },
    })
    createdShareholderIds.push(holder.id)

    // FY1983 — a year no other suite seeds, so its row is ours alone. The
    // 1,000-share purchase was replaced by a correction (soft-deleted); the
    // 7-share one is live.
    const corrected = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdAt: new Date('1983-06-15T12:00:00Z'),
        createdById: 'admin-1',
        deleted: true,
        deletedAt: new Date(),
        entries: { create: { shareholderId: holder.id, shares: 1000 } },
      },
    })
    const live = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdAt: new Date('1983-07-01T12:00:00Z'),
        createdById: 'admin-1',
        entries: { create: { shareholderId: holder.id, shares: 7 } },
      },
    })
    createdTransactionIds.push(corrected.id, live.id)

    const html = renderToStaticMarkup(await ExpensesPage())

    const row = html.match(/<tr><td class="font-semibold">FY1983<\/td>.*?<\/tr>/)?.[0]
    expect(row).toBeDefined()
    const cells = [...row!.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1])
    expect(cells).toEqual(['FY1983', '$7', '—', '—', '+$7'])
  })
})
