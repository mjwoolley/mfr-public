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
import { transaction } from '@/lib/db/schema'
import { sendEmail } from '@/lib/accounting/email'
import { render } from '@react-email/render'

const ADMIN_SESSION = {
  user: {
    id: 'admin-inkind',
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

async function ownTransactions() {
  const rows = await db.query.transaction.findMany({
    where: eq(transaction.createdById, ADMIN_SESSION.user.id),
  })
  for (const r of rows) if (!createdTransactionIds.includes(r.id)) createdTransactionIds.push(r.id)
  return rows
}

async function makeShareholder(name: string, email?: string) {
  const row = await testDb.shareholder.create({
    data: { name: `${name} ${Date.now()}-${Math.random()}`, email: email ?? null },
  })
  createdShareholderIds.push(row.id)
  return row
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
  vi.mocked(sendEmail).mockClear()
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {})
  }
  createdTransactionIds.length = 0
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
})

describe('in-kind share purchases', () => {
  // An in-kind purchase is goods or labour, so a ledger row with no note of
  // what came in is unauditable. The browser marks the field required; this is
  // the enforcement that actually counts.
  it('refuses an in-kind purchase with no description, and writes nothing', async () => {
    const sh = await makeShareholder('In Kind No Desc')

    const result = await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '100', inKind: 'true', description: '' }),
    )

    expect(result?.error).toMatch(/description is required/i)
    expect(await ownTransactions()).toHaveLength(0)
  })

  it('records the flag and the description when one is given', async () => {
    const sh = await makeShareholder('In Kind OK')

    const result = await createContribution(
      undefined,
      fd({
        shareholderId: sh.id,
        amount: '500',
        inKind: 'true',
        description: 'deck lumber and two days of labour',
      }),
    )
    expect(result?.error).toBeUndefined()

    const [t] = await ownTransactions()
    expect(t.inKind).toBe(true)
    expect(t.description).toBe('deck lumber and two days of labour')
  })

  it('defaults to false, and leaves the description optional for a cash purchase', async () => {
    const sh = await makeShareholder('Cash')

    const result = await createContribution(undefined, fd({ shareholderId: sh.id, amount: '250' }))
    expect(result?.error).toBeUndefined()

    const [t] = await ownTransactions()
    expect(t.inKind).toBe(false)
    expect(t.description).toBeNull()
  })

  // The flag belongs to a purchase; a transfer moves shares that already
  // exist, so nothing can be contributed in kind.
  it('ignores a stray in-kind flag on a transfer', async () => {
    const from = await makeShareholder('From')
    const to = await makeShareholder('To')
    await createContribution(undefined, fd({ shareholderId: from.id, amount: '100' }))

    await createTransfer(
      undefined,
      fd({
        fromShareholderId: from.id,
        toShareholderId: to.id,
        amount: '40',
        description: 'a transfer',
        inKind: 'true',
      }),
    )

    const transfer = (await ownTransactions()).find((t) => t.type === 'TRANSFER')!
    expect(transfer.inKind).toBe(false)
  })

  it('tells the shareholder what was contributed in the notification email', async () => {
    const sh = await makeShareholder('Emailed', `inkind-${Date.now()}@example.com`)

    await createContribution(
      undefined,
      fd({
        shareholderId: sh.id,
        amount: '500',
        inKind: 'true',
        description: 'deck lumber and two days of labour',
      }),
    )
    await ownTransactions()

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.subject).toContain('500 shares')

    // Assert on the rendered message, not the element's props: the action
    // invokes the template as a function, so `react` is already the <Html>
    // element and carries none of the component's own props.
    const html = await render(call.react)
    expect(html).toContain('In kind')
    expect(html).toContain('deck lumber and two days of labour')
    expect(html).toContain('500 shares')
  })
})
