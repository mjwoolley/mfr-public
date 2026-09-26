// Requirement coverage for the admin record actions' refusals (CAP-033,
// CAP-034, CAP-035, CAP-036). Every rule here is decided before anything is
// written, so the DB client is a stub: a refusal must return the exact message
// and never open a DB transaction or insert a row ("nothing is recorded").
// The DB-backed outcomes (balances, approvals) live in
// tests/accounting-integration/requirements-*.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authMock, db } = vi.hoisted(() => ({
  authMock: vi.fn(),
  db: {
    query: {
      shareholder: { findFirst: vi.fn() },
      transaction: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))
vi.mock('@/lib/db/client', () => ({ db }))

import { sendEmail } from '@/lib/accounting/email'
import { createContribution } from './contributions'
import { createTransfer } from './transfers'
import { createAdjustment } from './adjustments'
import { createCorrection } from './corrections'

const ADMIN_SESSION = {
  user: {
    id: 'admin-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: true },
    shareholderId: null,
    email: 'admin@example.com',
    name: 'Ada Admin',
  },
  expires: '2099-01-01',
}

const ANNA = { id: 'sh-anna', name: 'Anna Miller', email: null, active: true }
const BEN = { id: 'sh-ben', name: 'Ben Miller', email: null, active: true }
const INACTIVE = { id: 'sh-gone', name: 'Gone Miller', email: null, active: false }
const BY_ID: Record<string, typeof ANNA> = {
  [ANNA.id]: ANNA,
  [BEN.id]: BEN,
  [INACTIVE.id]: INACTIVE,
}

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

// Drizzle's eq(column, value) keeps the bound value in its query chunks; pull
// it out so the stub can answer "find shareholder <id>" like the real table.
function boundValue(where: unknown): unknown {
  const chunks = (where as { queryChunks?: unknown[] }).queryChunks ?? []
  const param = chunks.find(
    (c) => typeof c === 'object' && c !== null && 'value' in c && 'encoder' in c,
  ) as { value: unknown } | undefined
  return param?.value
}

function expectNothingRecorded() {
  expect(db.transaction).not.toHaveBeenCalled()
  expect(db.insert).not.toHaveBeenCalled()
  expect(db.update).not.toHaveBeenCalled()
  expect(sendEmail).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue(ADMIN_SESSION)
  db.query.shareholder.findFirst.mockImplementation(async ({ where }: { where: unknown }) => {
    return BY_ID[String(boundValue(where))]
  })
})

describe('CAP-033 Record a share purchase — refusals', () => {
  it.each([['0'], ['-5']])('CAP-033 · Share count must be positive (%s shares)', async (shares) => {
    const result = await createContribution(
      undefined,
      fd({ shareholderId: ANNA.id, amount: shares, description: 'x' }),
    )
    expect(result).toEqual({ error: 'Shares must be greater than zero' })
    expectNothingRecorded()
  })

  it('CAP-033 · A shareholder must be chosen', async () => {
    const result = await createContribution(
      undefined,
      fd({ shareholderId: '', amount: '100', description: 'x' }),
    )
    expect(result).toEqual({ error: 'Select a shareholder' })
    expectNothingRecorded()
  })
})

describe('CAP-034 Share transfers — refusals', () => {
  const valid = {
    fromShareholderId: ANNA.id,
    toShareholderId: BEN.id,
    amount: '100',
    description: 'e2e transfer',
  }

  it('CAP-034 · A transfer needs a description', async () => {
    const result = await createTransfer(undefined, fd({ ...valid, description: '   ' }))
    expect(result).toEqual({ error: 'A description is required' })
    expectNothingRecorded()
  })

  it('CAP-034 · A shareholder cannot transfer to themselves', async () => {
    const result = await createTransfer(
      undefined,
      fd({ ...valid, fromShareholderId: ANNA.id, toShareholderId: ANNA.id }),
    )
    expect(result).toEqual({ error: 'From and to shareholders must be different' })
    expectNothingRecorded()
  })

  it.each([
    ['no From shareholder', { fromShareholderId: '' }, 'Select who the shares are coming from'],
    ['no To shareholder', { toShareholderId: '' }, 'Select who the shares are going to'],
    ['0 shares', { amount: '0' }, 'Shares must be greater than zero'],
  ])(
    'CAP-034 · Missing or invalid choices are refused (%s)',
    async (_problem, override, message) => {
      const result = await createTransfer(undefined, fd({ ...valid, ...override }))
      expect(result).toEqual({ error: message })
      expectNothingRecorded()
    },
  )

  it.each([
    ['the sender', { fromShareholderId: INACTIVE.id }],
    ['the receiver', { toShareholderId: INACTIVE.id }],
  ])(
    'CAP-034 · Both parties must be active shareholders (%s deactivated)',
    async (_who, override) => {
      const result = await createTransfer(undefined, fd({ ...valid, ...override }))
      expect(result).toEqual({ error: 'Shareholder not found or inactive' })
      expectNothingRecorded()
    },
  )

  // Control for the stubbed lookup: with both parties active the action gets
  // as far as the write, so the refusals above are about activity, not a miss.
  it('reaches the write when both parties are active', async () => {
    db.transaction.mockRejectedValueOnce(new Error('WRITE'))
    await expect(createTransfer(undefined, fd(valid))).rejects.toThrow('WRITE')
  })
})

describe('CAP-035 Balance adjustments — refusals', () => {
  it('CAP-035 · An adjustment needs a reason', async () => {
    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: ANNA.id, amount: '25', description: '' }),
    )
    expect(result).toEqual({ error: 'A description is required' })
    expectNothingRecorded()
  })

  it('CAP-035 · A zero adjustment is refused', async () => {
    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: ANNA.id, amount: '0', description: 'reconcile' }),
    )
    expect(result).toEqual({ error: 'Shares must not be zero' })
    expectNothingRecorded()
  })

  it('CAP-035 · Only active shareholders can be adjusted', async () => {
    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: INACTIVE.id, amount: '25', description: 'reconcile' }),
    )
    expect(result).toEqual({ error: 'Shareholder not found or inactive' })
    expectNothingRecorded()
  })

  it('reaches the write for an active shareholder', async () => {
    db.transaction.mockRejectedValueOnce(new Error('WRITE'))
    await expect(
      createAdjustment(undefined, fd({ shareholderId: ANNA.id, amount: '25', description: 'r' })),
    ).rejects.toThrow('WRITE')
  })
})

describe('CAP-036 Transaction corrections — refusals', () => {
  const original = {
    id: 'tx-original',
    type: 'TRANSFER',
    createdAt: new Date('2020-01-15T12:00:00Z'),
    entries: [
      { shareholderId: ANNA.id, shares: '-100', shareholder: ANNA },
      { shareholderId: BEN.id, shares: '100', shareholder: BEN },
    ],
  }

  beforeEach(() => {
    db.query.transaction.findFirst.mockResolvedValue(original)
  })

  it('CAP-036 · Every shareholder on the original needs a non-zero amount', async () => {
    const result = await createCorrection(
      undefined,
      fd({
        originalTransactionId: original.id,
        description: 'fix',
        [`amount_${ANNA.id}`]: '0',
        [`amount_${BEN.id}`]: '40',
      }),
    )
    expect(result).toEqual({ error: 'Enter a non-zero correction amount for Anna Miller' })
    expectNothingRecorded()
  })

  it('CAP-036 · A correction needs a description', async () => {
    const result = await createCorrection(
      undefined,
      fd({
        originalTransactionId: original.id,
        description: '',
        [`amount_${ANNA.id}`]: '-40',
        [`amount_${BEN.id}`]: '40',
      }),
    )
    expect(result).toEqual({ error: 'A description is required' })
    expectNothingRecorded()
  })
})
