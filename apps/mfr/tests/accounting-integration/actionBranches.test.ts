// Error/validation branches of the admin actions that the happy-path suites
// (approvals.test.ts, shareholders.test.ts, harness.test.ts) don't reach:
// updateDisputeReason, expense update/delete edges, contribution/transfer/
// adjustment lookup failures, correction per-entry validation, and the P2002
// friendly errors on shareholder linking.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'

// Same mock trio as approvals.test.ts (see comments there).
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/accounting/email'
import { updateDisputeReason, disputeTransaction } from '@/actions/accounting/approvals'
import { createExpense, updateExpense, deleteExpense } from '@/actions/accounting/expenses'
import { createContribution } from '@/actions/accounting/contributions'
import { createCorrection } from '@/actions/accounting/corrections'
import { createTransfer } from '@/actions/accounting/transfers'
import { createAdjustment } from '@/actions/accounting/adjustments'
import {
  createShareholder,
  updateShareholder,
  linkShareholderToUser,
  unlinkShareholder,
} from '@/actions/accounting/shareholders'
import { ApprovalStatus, TransactionType } from '@/lib/accounting/enums'

function shareholderSession(shareholderId: string) {
  return {
    user: {
      id: `user-for-${shareholderId}`,
      status: 'approved',
      roles: { siteOwner: false, siteManager: false, accountingManager: false },
      shareholderId,
      email: 'shareholder@example.com',
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

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

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const createdShareholderIds: string[] = []
const createdTransactionIds: string[] = []
const createdExpenseIds: string[] = []
const createdUserIds: string[] = []

async function makeShareholder(namePrefix: string, data: { email?: string | null } = {}) {
  const shareholder = await testDb.shareholder.create({
    data: { name: `${namePrefix} ${Date.now()}-${Math.random()}`, email: data.email ?? null },
  })
  createdShareholderIds.push(shareholder.id)
  return shareholder
}

async function makeDisputedApproval(shareholderId: string) {
  const transaction = await testDb.transaction.create({
    data: {
      type: TransactionType.CONTRIBUTION,
      createdById: 'admin-1',
      entries: { create: { shareholderId, shares: 10 } },
      approvals: {
        create: {
          shareholderId,
          status: ApprovalStatus.DISPUTED,
          disputedAt: new Date(),
          disputeReason: 'original reason',
        },
      },
    },
    include: { approvals: true },
  })
  createdTransactionIds.push(transaction.id)
  return transaction.approvals[0]
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  vi.mocked(sendEmail).mockReset()
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {})
  }
  createdTransactionIds.length = 0
  for (const id of createdExpenseIds) {
    await testDb.expense.delete({ where: { id } }).catch(() => {})
  }
  createdExpenseIds.length = 0
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
  for (const id of createdUserIds) {
    await testIdentityDb.delete(users).where(eq(users.id, id))
  }
  createdUserIds.length = 0
})

describe('updateDisputeReason', () => {
  it("edits the reason on the owner's own open dispute", async () => {
    const sh = await makeShareholder('Reason Edit')
    const approval = await makeDisputedApproval(sh.id)
    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))

    await updateDisputeReason(approval.id, '  updated reason  ')

    const after = await testDb.transactionApproval.findUnique({ where: { id: approval.id } })
    expect(after?.disputeReason).toBe('updated reason')
    expect(after?.status).toBe(ApprovalStatus.DISPUTED)
  })

  it('rejects an empty reason', async () => {
    const sh = await makeShareholder('Reason Empty')
    const approval = await makeDisputedApproval(sh.id)
    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))

    await expect(updateDisputeReason(approval.id, '   ')).rejects.toThrow(/reason is required/i)
  })

  it("does not let a different shareholder edit someone else's dispute", async () => {
    const owner = await makeShareholder('Reason Owner')
    const attacker = await makeShareholder('Reason Attacker')
    const approval = await makeDisputedApproval(owner.id)
    vi.mocked(auth).mockResolvedValue(shareholderSession(attacker.id))

    await updateDisputeReason(approval.id, 'hijacked')

    const after = await testDb.transactionApproval.findUnique({ where: { id: approval.id } })
    expect(after?.disputeReason).toBe('original reason')
  })
})

describe('expenses — edit/delete edges', () => {
  it('createExpense rejects a missing description', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await createExpense(
      undefined,
      fd({
        description: '  ',
        amount: '10',
        category: 'TAXES',
        capital: 'false',
        incurredAt: '2026-01-01',
      }),
    )
    expect(result?.error).toMatch(/description/i)
  })

  it('updateExpense rejects invalid input and reports a missing expense', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    const invalid = await updateExpense(
      'does-not-matter',
      undefined,
      fd({ description: 'x', amount: '-5', category: 'TAXES', capital: 'false' }),
    )
    expect(invalid?.error).toMatch(/greater than zero/i)

    const missing = await updateExpense(
      'no-such-expense',
      undefined,
      fd({ description: 'x', amount: '5', category: 'TAXES', capital: 'false' }),
    )
    expect(missing?.error).toBe('Expense not found')
  })

  it('updateExpense keeps the original incurredAt (report year never shifts)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const incurredAt = new Date('2020-07-01T00:00:00Z')
    const expense = await testDb.expense.create({
      data: {
        description: 'orig',
        amount: 10,
        category: 'TAXES',
        capital: false,
        incurredAt,
        createdByUserId: 'admin-1',
      },
    })
    createdExpenseIds.push(expense.id)

    const result = await updateExpense(
      expense.id,
      undefined,
      fd({ description: 'edited', amount: '20', category: 'REPAIRS', capital: 'true' }),
    )
    expect(result?.success).toBe(true)

    const after = await testDb.expense.findUnique({ where: { id: expense.id } })
    expect(after?.description).toBe('edited')
    expect(after?.incurredAt.toISOString()).toBe(incurredAt.toISOString())
  })

  it('deleteExpense reports a missing expense and hard-deletes an existing one', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    const missing = await deleteExpense('no-such-expense', undefined, fd({}))
    expect(missing?.error).toBe('Expense not found')

    const expense = await testDb.expense.create({
      data: {
        description: 'to delete',
        amount: 5,
        category: 'OTHER',
        capital: false,
        incurredAt: new Date(),
        createdByUserId: 'admin-1',
      },
    })
    const result = await deleteExpense(expense.id, undefined, fd({}))
    expect(result?.success).toBe(true)
    expect(await testDb.expense.findUnique({ where: { id: expense.id } })).toBeNull()
  })
})

describe('createContribution — validation and email branches', () => {
  it('rejects invalid input (zero amount)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await createContribution(undefined, fd({ shareholderId: 'sh', amount: '0' }))
    expect(result?.error).toMatch(/greater than zero/i)
  })

  it('rejects an unknown shareholder', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await createContribution(
      undefined,
      fd({ shareholderId: 'no-such-shareholder', amount: '10' }),
    )
    expect(result?.error).toBe('Shareholder not found or inactive')
  })

  it('rejects an inactive shareholder', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const sh = await makeShareholder('Inactive Contrib')
    await testDb.shareholder.update({ where: { id: sh.id }, data: { active: false } })

    const result = await createContribution(undefined, fd({ shareholderId: sh.id, amount: '10' }))
    expect(result?.error).toBe('Shareholder not found or inactive')
  })

  it('stores an empty description as null and skips email for an address-less shareholder', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const sh = await makeShareholder('No Email Contrib') // email: null

    const result = await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '25', description: '  ' }),
    )
    expect(result?.success).toBe(true)

    const transaction = await testDb.transaction.findFirst({
      where: { entries: { some: { shareholderId: sh.id } } },
    })
    createdTransactionIds.push(transaction!.id)
    expect(transaction?.description).toBeNull()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('createCorrection — per-entry validation', () => {
  it('rejects missing meta (no description)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await createCorrection(
      undefined,
      fd({ originalTransactionId: 't1', description: ' ' }),
    )
    expect(result?.error).toMatch(/description/i)
  })

  it('reports a missing original transaction', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await createCorrection(
      undefined,
      fd({ originalTransactionId: 'no-such-transaction', description: 'fix' }),
    )
    expect(result?.error).toBe('Original transaction not found')
  })

  it('requires a non-zero replacement amount for every affected shareholder', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const sh = await makeShareholder('Correction Amounts')
    const original = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: 'admin-1',
        entries: { create: { shareholderId: sh.id, shares: 50 } },
      },
    })
    createdTransactionIds.push(original.id)

    const missing = await createCorrection(
      undefined,
      fd({ originalTransactionId: original.id, description: 'fix' }),
    )
    expect(missing?.error).toMatch(/non-zero correction amount/i)

    const zero = await createCorrection(
      undefined,
      fd({ originalTransactionId: original.id, description: 'fix', [`amount_${sh.id}`]: '0' }),
    )
    expect(zero?.error).toMatch(/non-zero correction amount/i)
  })

  it('rejects an original with no entries (nothing to correct)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const original = await testDb.transaction.create({
      data: { type: TransactionType.ADJUSTMENT, createdById: 'admin-1' },
    })
    createdTransactionIds.push(original.id)

    const result = await createCorrection(
      undefined,
      fd({ originalTransactionId: original.id, description: 'fix' }),
    )
    expect(result?.error).toBe('The original transaction has nothing to correct')
  })
})

describe('createTransfer / createAdjustment — lookup failures', () => {
  it('transfer rejects invalid input', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await createTransfer(
      undefined,
      fd({ fromShareholderId: 'a', toShareholderId: 'b', amount: '-1' }),
    )
    expect(result?.error).toBeTruthy()
  })

  it('transfer rejects an unknown or inactive counterparty', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const from = await makeShareholder('Transfer From')

    const result = await createTransfer(
      undefined,
      fd({ fromShareholderId: from.id, toShareholderId: 'no-such', amount: '5', description: 't' }),
    )
    expect(result?.error).toBe('Shareholder not found or inactive')
  })

  it('adjustment rejects an unknown shareholder and invalid input', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    const invalid = await createAdjustment(undefined, fd({ shareholderId: 'x', amount: 'abc' }))
    expect(invalid?.error).toBeTruthy()

    const missing = await createAdjustment(
      undefined,
      fd({ shareholderId: 'no-such', amount: '5', description: 'a' }),
    )
    expect(missing?.error).toBe('Shareholder not found or inactive')
  })
})

describe('notification email branches (emailed shareholders)', () => {
  const ADMIN_NO_NAME = {
    user: {
      id: 'admin-2',
      status: 'approved',
      roles: { siteOwner: false, siteManager: false, accountingManager: true },
      shareholderId: null,
      email: null,
      name: null,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  it('contribution to an emailed shareholder sends a notification (admin without name/email)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_NO_NAME)
    const sh = await makeShareholder('Emailed Contrib', {
      email: `contrib-${Date.now()}@example.com`,
    })

    const result = await createContribution(
      undefined,
      fd({ shareholderId: sh.id, amount: '10', description: 'for the roof' }),
    )
    expect(result?.success).toBe(true)

    const transaction = await testDb.transaction.findFirst({
      where: { entries: { some: { shareholderId: sh.id } } },
    })
    createdTransactionIds.push(transaction!.id)
    expect(transaction?.createdByName).toBeNull()
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: sh.email, replyTo: undefined }),
    )
  })

  it('transfer notifies both emailed parties (admin without name/email)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_NO_NAME)
    const from = await makeShareholder('Transfer From Emailed', {
      email: `transfer-from-${Date.now()}@example.com`,
    })
    const to = await makeShareholder('Transfer To Emailed', {
      email: `transfer-to-${Date.now()}@example.com`,
    })

    const result = await createTransfer(
      undefined,
      fd({ fromShareholderId: from.id, toShareholderId: to.id, amount: '5', description: 'gift' }),
    )
    expect(result?.success).toBe(true)

    const transaction = await testDb.transaction.findFirst({
      where: { entries: { some: { shareholderId: from.id } } },
    })
    createdTransactionIds.push(transaction!.id)

    const recipients = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to)
    expect(recipients).toContain(from.email)
    expect(recipients).toContain(to.email)
  })

  it('adjustment notifies an emailed shareholder (admin without name/email)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_NO_NAME)
    const sh = await makeShareholder('Adjust Emailed', {
      email: `adjust-${Date.now()}@example.com`,
    })

    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: sh.id, amount: '-3', description: 'fee' }),
    )
    expect(result?.success).toBe(true)

    const transaction = await testDb.transaction.findFirst({
      where: { entries: { some: { shareholderId: sh.id } } },
    })
    createdTransactionIds.push(transaction!.id)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: sh.email }))
  })

  it('expense creation snapshots a name-less admin as null', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_NO_NAME)
    const result = await createExpense(
      undefined,
      fd({
        description: 'no-name admin expense',
        amount: '7',
        category: 'OTHER',
        capital: 'false',
        incurredAt: '2026-01-02',
      }),
    )
    expect(result?.success).toBe(true)

    const expense = await testDb.expense.findFirst({
      where: { description: 'no-name admin expense' },
    })
    createdExpenseIds.push(expense!.id)
    expect(expense?.createdByName).toBeNull()
    expect(expense?.createdByEmail).toBeNull()
  })

  it('correction notifies emailed shareholders on the original (admin without name/email)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_NO_NAME)
    const sh = await makeShareholder('Correction Emailed', {
      email: `correction-${Date.now()}@example.com`,
    })
    const original = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: 'admin-1',
        entries: { create: { shareholderId: sh.id, shares: 40 } },
      },
    })
    createdTransactionIds.push(original.id)

    const result = await createCorrection(
      undefined,
      fd({
        originalTransactionId: original.id,
        description: 'typo fix',
        [`amount_${sh.id}`]: '45',
      }),
    )
    expect(result?.success).toBe(true)

    const correction = await testDb.transaction.findFirst({
      where: { correctsTransactionId: original.id },
    })
    createdTransactionIds.push(correction!.id)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: sh.email }))

    const after = await testDb.transaction.findUnique({ where: { id: original.id } })
    expect(after?.deleted).toBe(true)
  })
})

describe('updateShareholder — input edges', () => {
  it('rejects invalid input (blank name)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await updateShareholder(
      undefined,
      fd({ shareholderId: 'sh-x', name: '  ', email: '' }),
    )
    expect(result?.error).toMatch(/name is required/i)
  })

  it('reports a missing shareholder', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await updateShareholder(
      undefined,
      fd({ shareholderId: 'no-such-shareholder', name: 'Name', email: '' }),
    )
    expect(result?.error).toBe('Shareholder not found')
  })
})

describe('shareholder linking — P2002 friendly errors', () => {
  it('updateShareholder reports a login already linked elsewhere instead of a raw Prisma error', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    const email = `linked-elsewhere-${Date.now()}@example.com`
    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email, status: 'approved' })
      .returning()
    createdUserIds.push(identityUser.id)

    const holder = await makeShareholder('Link Holder')
    await testDb.shareholder.update({
      where: { id: holder.id },
      data: { userId: identityUser.id },
    })
    const other = await makeShareholder('Link Other')

    // Editing `other` to the identity user's email finds that login and tries
    // to link it — but it already belongs to `holder`.
    const result = await updateShareholder(
      undefined,
      fd({ shareholderId: other.id, name: 'Link Other', email }),
    )
    expect(result?.error).toBe('That login is already linked to a different shareholder')
  })

  it('createShareholder reports a login already linked elsewhere (create-time P2002)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    const email = `create-p2002-${Date.now()}@example.com`
    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email, status: 'approved' })
      .returning()
    createdUserIds.push(identityUser.id)

    const holder = await makeShareholder('Create P2002 Holder')
    await testDb.shareholder.update({
      where: { id: holder.id },
      data: { userId: identityUser.id },
    })

    // Creating a NEW shareholder with that identity email auto-links — but the
    // login already belongs to `holder`, so the unique userId trips P2002.
    const result = await createShareholder(
      undefined,
      fd({ name: `Create P2002 New ${Date.now()}`, email }),
    )
    expect(result?.error).toBe('That login is already linked to a different shareholder')
  })

  it('linkShareholderToUser reports the same friendly error', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email: `direct-link-${Date.now()}@example.com`, status: 'approved' })
      .returning()
    createdUserIds.push(identityUser.id)

    const holder = await makeShareholder('Direct Holder')
    await testDb.shareholder.update({
      where: { id: holder.id },
      data: { userId: identityUser.id },
    })
    const other = await makeShareholder('Direct Other')

    const result = await linkShareholderToUser(other.id, identityUser.id)
    expect(result?.error).toBe('That login is already linked to a different shareholder')
  })

  it('unlinkShareholder clears the link', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email: `unlink-${Date.now()}@example.com`, status: 'approved' })
      .returning()
    createdUserIds.push(identityUser.id)

    const holder = await makeShareholder('Unlink Holder')
    await testDb.shareholder.update({
      where: { id: holder.id },
      data: { userId: identityUser.id },
    })

    await unlinkShareholder(holder.id)
    const after = await testDb.shareholder.findUnique({ where: { id: holder.id } })
    expect(after?.userId).toBeNull()
  })
})
