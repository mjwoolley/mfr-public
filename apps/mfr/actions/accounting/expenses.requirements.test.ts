import { describe, it, expect, vi, beforeEach } from 'vitest'

// Requirements coverage for CAP-044 (requirements/accounting/expense-log.md):
// createExpense's validation outlines and the revalidation that makes a new
// expense show up straight away (CAP-043). The DB and admin check are mocked;
// the real-DB paths live in tests/accounting-integration.

const { insertValues, requireAdmin, revalidatePath } = vi.hoisted(() => ({
  insertValues: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  db: { insert: vi.fn(() => ({ values: insertValues })) },
}))
vi.mock('@/lib/accounting/authz', () => ({ requireAdmin }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { createExpense } from './expenses'

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const valid = {
  description: 'County property tax',
  amount: '1250.00',
  category: 'TAXES',
  capital: 'false',
  incurredAt: '2026-09-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  insertValues.mockResolvedValue(undefined)
  requireAdmin.mockResolvedValue({
    user: { id: 'admin-1', name: 'Pat Miller', email: 'pat@family.org' },
  })
})

describe('CAP-044 · Amount must be at least one cent', () => {
  it('CAP-044 · Amount must be at least one cent — 0.01 is recorded', async () => {
    const result = await createExpense(undefined, fd({ ...valid, amount: '0.01' }))

    expect(result).toEqual({ success: true })
    expect(insertValues).toHaveBeenCalledTimes(1)
    expect(insertValues.mock.calls[0][0]).toMatchObject({ amount: '0.01' })
  })

  it.each(['0', '-25'])(
    'CAP-044 · Amount must be at least one cent — %s is refused and nothing is saved',
    async (amount) => {
      const result = await createExpense(undefined, fd({ ...valid, amount }))

      expect(result).toEqual({ error: 'Amount must be greater than zero' })
      expect(insertValues).not.toHaveBeenCalled()
    },
  )
})

describe('CAP-044 · Required details are enforced', () => {
  it.each([
    ['a blank description', { description: '   ' }, 'Description is required'],
    // What a blank date input submits. (A request with the field missing
    // entirely is the separately-flagged 1970 defect and is not locked in here.)
    ['no date incurred', { incurredAt: '' }, 'Enter a valid date'],
    ['an unknown category', { category: 'BOATS' }, 'Choose a category'],
  ])('CAP-044 · Required details are enforced — %s', async (_label, over, message) => {
    const result = await createExpense(undefined, fd({ ...valid, ...over }))

    expect(result).toEqual({ error: message })
    expect(insertValues).not.toHaveBeenCalled()
  })
})

describe('CAP-044 / CAP-043 · A newly recorded expense reaches the other views', () => {
  it('CAP-043 · A newly recorded expense appears straight away — the activity log, report and history are revalidated', async () => {
    await createExpense(undefined, fd(valid))

    expect(revalidatePath.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/accounting/admin/activity',
      '/accounting/admin/expenses',
      '/accounting/expenses',
    ])
  })

  it('CAP-044 · Admin records an expense — stored with the recorder for the activity log', async () => {
    await createExpense(undefined, fd(valid))

    expect(insertValues.mock.calls[0][0]).toMatchObject({
      description: 'County property tax',
      amount: '1250',
      category: 'TAXES',
      capital: false,
      incurredAt: new Date('2026-09-01T00:00:00.000Z'),
      createdByUserId: 'admin-1',
      createdByName: 'Pat Miller',
      createdByEmail: 'pat@family.org',
    })
  })
})
