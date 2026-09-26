// Requirement coverage, against the real test DB, for what the record actions
// write and how the ledger totals read it back: transfers (CAP-034),
// adjustments (CAP-035), corrections (CAP-036, CAP-037), approvals being
// created and never gating a balance (CAP-032, CAP-040), and the fiscal-year
// "raised" figure (CAP-041).
//
// Other suites write to the same DB concurrently, so per-shareholder figures
// are asserted exactly, and global totals (shares outstanding, raised this
// year) are asserted through deltas of deliberately huge fixture amounts,
// rounded to the fixture's scale.
//
// Deliberately NOT asserted (CAP-036 open questions): balances after accepting
// the correction form's default "full reversal" amounts, and correcting the
// same transaction twice. Nor a transfer taking a shareholder below zero
// (CAP-034 open question).
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { auth } from '@/lib/auth'
import { testDb } from './testDb'
import {
  adminSession,
  shareholderSession,
  fd,
  makeShareholder,
  transactionsFor,
  cleanupFixtures,
} from './requirementsFixtures'
import { createContribution } from '@/actions/accounting/contributions'
import { createTransfer } from '@/actions/accounting/transfers'
import { createAdjustment } from '@/actions/accounting/adjustments'
import { createCorrection } from '@/actions/accounting/corrections'
import { disputeTransaction } from '@/actions/accounting/approvals'
import {
  getShareholderBalance,
  getTotalSharesOutstanding,
  getAllShareholderBalances,
  getRaisedThisYear,
  getContributionsByYear,
} from '@/lib/accounting/ledger'
import { fiscalYear, currentFiscalYear } from '@/lib/accounting/fiscalYear'
import { GET as currentYearTotal } from '@/app/accounting/api/contributions/current-year/route'
import { ApprovalStatus, TransactionType } from '@/lib/accounting/enums'

afterEach(async () => {
  vi.mocked(auth).mockReset()
  await cleanupFixtures()
})

function asAdmin() {
  vi.mocked(auth).mockResolvedValue(adminSession())
}

async function purchase(shareholderId: string, shares: number, date?: string) {
  asAdmin()
  const result = await createContribution(
    undefined,
    fd({ shareholderId, amount: String(shares), description: 'seed', ...(date ? { date } : {}) }),
  )
  expect(result).toEqual({ success: true })
  const [t] = (await transactionsFor(shareholderId)).slice(-1)
  return t
}

async function balanceOf(shareholderId: string) {
  return Number(await getShareholderBalance(shareholderId))
}

async function ownershipRowShares(shareholderId: string) {
  const { rows } = await getAllShareholderBalances()
  const row = rows.find((r) => r.shareholder.id === shareholderId)
  return row ? Number(row.shares) : undefined
}

/** Ledger entries of one transaction as { shareholderId: shares }. */
async function entriesOf(transactionId: string) {
  const rows = await testDb.ledgerEntry.findMany({ where: { transactionId } })
  return Object.fromEntries(rows.map((r) => [r.shareholderId, Number(r.shares)]))
}

function approvalsOf(t: { approvals: { shareholderId: string; status: string }[] }) {
  return t.approvals
    .map((a) => ({ shareholderId: a.shareholderId, status: a.status }))
    .sort((a, b) => a.shareholderId.localeCompare(b.shareholderId))
}

describe('CAP-034 Share transfers', () => {
  it('CAP-034 · A transfer moves shares from one shareholder to another', async () => {
    const anna = await makeShareholder('Anna Miller')
    const ben = await makeShareholder('Ben Miller')
    await purchase(anna.id, 250)

    const result = await createTransfer(
      undefined,
      fd({
        fromShareholderId: anna.id,
        toShareholderId: ben.id,
        amount: '100',
        description: 'e2e transfer',
      }),
    )

    expect(result).toEqual({ success: true })
    expect(await balanceOf(anna.id)).toBe(150)
    expect(await balanceOf(ben.id)).toBe(100)
    const transfer = (await transactionsFor(ben.id))[0]
    expect(transfer.type).toBe(TransactionType.TRANSFER)
    // One -100 and one +100 entry: the transfer nets to zero, which is why the
    // total outstanding is unchanged.
    expect(await entriesOf(transfer.id)).toEqual({ [anna.id]: -100, [ben.id]: 100 })
  })

  it('CAP-034 · Both parties are asked to approve the transfer', async () => {
    const anna = await makeShareholder('Anna Miller')
    const ben = await makeShareholder('Ben Miller')
    asAdmin()

    await createTransfer(
      undefined,
      fd({ fromShareholderId: anna.id, toShareholderId: ben.id, amount: '10', description: 'x' }),
    )

    const [transfer] = await transactionsFor(anna.id)
    expect(approvalsOf(transfer)).toEqual(
      [
        { shareholderId: anna.id, status: ApprovalStatus.PENDING },
        { shareholderId: ben.id, status: ApprovalStatus.PENDING },
      ].sort((a, b) => a.shareholderId.localeCompare(b.shareholderId)),
    )
  })

  it('CAP-034 · Both parties must be active shareholders (nothing recorded)', async () => {
    const anna = await makeShareholder('Anna Miller')
    const gone = await makeShareholder('Gone Miller', { active: false })
    asAdmin()

    const result = await createTransfer(
      undefined,
      fd({ fromShareholderId: anna.id, toShareholderId: gone.id, amount: '10', description: 'x' }),
    )

    expect(result).toEqual({ error: 'Shareholder not found or inactive' })
    expect(await transactionsFor(anna.id)).toEqual([])
    expect(await transactionsFor(gone.id)).toEqual([])
  })
})

describe('CAP-035 Balance adjustments', () => {
  it.each([
    [25, 125],
    [-25, 75],
  ])('CAP-035 · An adjustment can add or remove shares (%i → %i)', async (shares, expected) => {
    const sh = await makeShareholder('Adjusted Miller')
    await purchase(sh.id, 100)

    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: sh.id, amount: String(shares), description: 'reconcile' }),
    )

    expect(result).toEqual({ success: true })
    expect(await balanceOf(sh.id)).toBe(expected)
    const adjustment = (await transactionsFor(sh.id)).find(
      (t) => t.type === TransactionType.ADJUSTMENT,
    )!
    expect(await entriesOf(adjustment.id)).toEqual({ [sh.id]: shares })
  })

  it('CAP-035 · Only active shareholders can be adjusted (nothing recorded)', async () => {
    const gone = await makeShareholder('Gone Miller', { active: false })
    asAdmin()

    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: gone.id, amount: '25', description: 'reconcile' }),
    )

    expect(result).toEqual({ error: 'Shareholder not found or inactive' })
    expect(await transactionsFor(gone.id)).toEqual([])
  })
})

describe('CAP-032 Transaction approvals and disputes — approvals and balances', () => {
  it("CAP-032 · Every recorded entry waits for each affected shareholder's approval", async () => {
    const anna = await makeShareholder('Anna Miller')
    const ben = await makeShareholder('Ben Miller')
    const original = await purchase(anna.id, 100)
    asAdmin()
    await createTransfer(
      undefined,
      fd({ fromShareholderId: anna.id, toShareholderId: ben.id, amount: '10', description: 't' }),
    )
    await createAdjustment(undefined, fd({ shareholderId: anna.id, amount: '5', description: 'a' }))
    await createCorrection(
      undefined,
      fd({ originalTransactionId: original.id, description: 'c', [`amount_${anna.id}`]: '90' }),
    )

    const byType = Object.fromEntries(
      (await transactionsFor(anna.id)).map((t) => [t.type, approvalsOf(t)]),
    )
    const annaPending = { shareholderId: anna.id, status: ApprovalStatus.PENDING }
    expect(byType[TransactionType.CONTRIBUTION]).toEqual([annaPending])
    expect(byType[TransactionType.TRANSFER]).toContainEqual(annaPending)
    expect(byType[TransactionType.ADJUSTMENT]).toEqual([annaPending])
    expect(byType[TransactionType.CORRECTION]).toEqual([annaPending])
  })

  it('CAP-032 · Entries count toward balances before and regardless of approval', async () => {
    const sh = await makeShareholder('Unreviewed Miller')
    const t = await purchase(sh.id, 250)

    // Not reviewed yet: already in the balance and on the ownership report.
    expect(t.approvals.map((a) => a.status)).toEqual([ApprovalStatus.PENDING])
    expect(await balanceOf(sh.id)).toBe(250)
    expect(await ownershipRowShares(sh.id)).toBe(250)

    // Disputed: still counts.
    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))
    await disputeTransaction(t.approvals[0].id, 'Amount is off by 50')
    const approval = await testDb.transactionApproval.findUnique({
      where: { id: t.approvals[0].id },
    })
    expect(approval?.status).toBe(ApprovalStatus.DISPUTED)
    expect(await balanceOf(sh.id)).toBe(250)
    expect(await ownershipRowShares(sh.id)).toBe(250)
  })
})

describe('CAP-040 Ownership report — ledger rows', () => {
  it('CAP-040 · Entries count before they are approved', async () => {
    const sh = await makeShareholder('Pending Owner')
    await purchase(sh.id, 40)

    expect(await ownershipRowShares(sh.id)).toBe(40)
  })

  it("CAP-040 · Corrected entries don't count", async () => {
    const sh = await makeShareholder('Corrected Owner')
    const original = await purchase(sh.id, 100)
    asAdmin()

    await createCorrection(
      undefined,
      fd({ originalTransactionId: original.id, description: 'was 60', [`amount_${sh.id}`]: '60' }),
    )

    expect(await ownershipRowShares(sh.id)).toBe(60)
  })
})

describe('CAP-036 Transaction corrections', () => {
  it('CAP-036 · The original stays visible but stops counting', async () => {
    // Amounts large enough to read the global total's change through other
    // suites' concurrent writes (libDb.test.ts adds a 1M adjustment). Dated in
    // a past fiscal year so it never touches the current year's "raised"
    // figure that libDb.test.ts bounds.
    const sh = await makeShareholder('Corrected Miller')
    const original = await purchase(sh.id, 700_000_000, '2020-01-15')
    const outstandingBefore = Number(await getTotalSharesOutstanding())
    asAdmin()

    const result = await createCorrection(
      undefined,
      fd({
        originalTransactionId: original.id,
        description: 'keyed an extra digit',
        [`amount_${sh.id}`]: '300000000',
      }),
    )

    expect(result).toEqual({ success: true })
    const originalAfter = await testDb.transaction.findUnique({ where: { id: original.id } })
    expect(originalAfter?.deleted).toBe(true) // kept, marked corrected
    const correction = (await transactionsFor(sh.id)).find(
      (t) => t.type === TransactionType.CORRECTION,
    )!
    expect(correction.correctsTransactionId).toBe(original.id)
    expect(await entriesOf(correction.id)).toEqual({ [sh.id]: 300_000_000 })
    // Balance: only the correction's own amount counts.
    expect(await balanceOf(sh.id)).toBe(300_000_000)
    // Shares outstanding: -700M for the original, +300M for the correction.
    const outstandingDelta = Number(await getTotalSharesOutstanding()) - outstandingBefore
    expect(Math.round(outstandingDelta / 100_000_000)).toBe(-4)
  })

  it('CAP-036 · Affected shareholders are asked to approve the correction', async () => {
    const anna = await makeShareholder('Anna Miller')
    const ben = await makeShareholder('Ben Miller')
    await purchase(anna.id, 250)
    asAdmin()
    await createTransfer(
      undefined,
      fd({ fromShareholderId: anna.id, toShareholderId: ben.id, amount: '100', description: 't' }),
    )
    const transfer = (await transactionsFor(ben.id))[0]

    await createCorrection(
      undefined,
      fd({
        originalTransactionId: transfer.id,
        description: 'should have been 40',
        [`amount_${anna.id}`]: '-40',
        [`amount_${ben.id}`]: '40',
      }),
    )

    const correction = (await transactionsFor(ben.id)).find(
      (t) => t.type === TransactionType.CORRECTION,
    )!
    expect(approvalsOf(correction)).toEqual(
      [
        { shareholderId: anna.id, status: ApprovalStatus.PENDING },
        { shareholderId: ben.id, status: ApprovalStatus.PENDING },
      ].sort((a, b) => a.shareholderId.localeCompare(b.shareholderId)),
    )
  })
})

describe('CAP-037 Transaction dates and fiscal year — corrections', () => {
  it("CAP-036 · The correction keeps the original's fiscal year by default", async () => {
    const sh = await makeShareholder('Dated Miller')
    const original = await purchase(sh.id, 100, '2020-01-15')
    asAdmin()

    // No date posted: the correction takes the original's.
    await createCorrection(
      undefined,
      fd({ originalTransactionId: original.id, description: 'fix', [`amount_${sh.id}`]: '90' }),
    )

    const correction = (await transactionsFor(sh.id)).find(
      (t) => t.type === TransactionType.CORRECTION,
    )!
    expect(correction.createdAt.toISOString().slice(0, 10)).toBe('2020-01-15')
    expect(fiscalYear(correction.createdAt)).toBe(2019)
  })

  it('CAP-037 · A later date change always moves the figure with it (partial: see note)', async () => {
    const sh = await makeShareholder('Redated Miller')
    const original = await purchase(sh.id, 100, '2021-02-10')
    expect(fiscalYear(original.createdAt)).toBe(2020)
    asAdmin()

    await createCorrection(
      undefined,
      fd({
        originalTransactionId: original.id,
        description: 'was March',
        date: '2021-03-10',
        [`amount_${sh.id}`]: '100',
      }),
    )

    const correction = (await transactionsFor(sh.id)).find(
      (t) => t.type === TransactionType.CORRECTION,
    )!
    expect(fiscalYear(correction.createdAt)).toBe(2021)
    // The original no longer counts in FY2020's share-purchase figure.
    const years = await getContributionsByYear()
    const fy2020 = years.find((y) => y.year === 2020)
    expect(fy2020?.purchases.filter((p) => p.shareholderId === sh.id) ?? []).toEqual([])
    // NOTE: the correction's own shares do not count in FY2021's
    // share-purchase figure either — corrections are typed CORRECTION and every
    // purchase figure counts CONTRIBUTION only. That contradicts the scenario's
    // "the correction's shares count in FY2021"; left unasserted and reported.
  })
})

// Current-fiscal-year purchases here stay under 1M: libDb.test.ts asserts
// that "raised" moves by less than 1M across its own window, and these files
// run concurrently. Other suites' current-year purchases are a few hundred
// shares, so deltas are read at a 100,000-share scale.
describe('CAP-041 Share purchase goal — the raised figure', () => {
  it("CAP-041 · Corrected purchases don't count toward the goal (partial: see note)", async () => {
    const sh = await makeShareholder('Goal Miller')
    const before = (await getRaisedThisYear()).raised
    // A live current-year purchase and a corrected (soft-deleted) one.
    await purchase(sh.id, 700_000)
    await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: 'admin-req',
        deleted: true,
        deletedAt: new Date(),
        entries: { create: { shareholderId: sh.id, shares: 900_000 } },
      },
    })

    const delta = (await getRaisedThisYear()).raised - before

    // 7 if the corrected 900,000 is left out, 16 if it leaked in.
    expect(Math.round(delta / 100_000)).toBe(7)
    // NOTE: a correction's own shares are never counted toward the goal
    // (CORRECTION, not CONTRIBUTION), contradicting "only the correction's
    // shares count toward the FY2026 goal"; left unasserted and reported.
  })

  it('CAP-041 · Only share purchases in the current fiscal year count toward the goal', async () => {
    const sh = await makeShareholder('Prior Year Miller')
    const lastYearDate = `${(await getRaisedThisYear()).year - 1}-06-15`
    const before = (await getRaisedThisYear()).raised

    await purchase(sh.id, 700_000, lastYearDate)
    asAdmin()
    await createAdjustment(
      undefined,
      fd({ shareholderId: sh.id, amount: '800000', description: 'reconcile' }),
    )
    const delta = (await getRaisedThisYear()).raised - before

    // Neither last fiscal year's purchase nor this year's adjustment counts.
    expect(Math.round(delta / 100_000)).toBe(0)
  })
})

describe('CAP-041 Share purchase goal — the home page total', () => {
  it('CAP-041 · The home page shows the same total to signed-in members (no names)', async () => {
    const sh = await makeShareholder('Home Page Miller')
    await purchase(sh.id, 700_000)

    const body = await (await currentYearTotal()).json()

    // Year, raised and goal only: nothing that names a shareholder.
    expect(Object.keys(body).sort()).toEqual(['goal', 'raised', 'year'])
    expect(body.year).toBe(currentFiscalYear())
    expect(JSON.stringify(body)).not.toContain('Home Page Miller')
    // The same raised figure the goal tracker uses.
    expect(Math.round((body.raised - (await getRaisedThisYear()).raised) / 100_000)).toBe(0)
    expect(body.raised).toBeGreaterThanOrEqual(700_000)
  })
})
