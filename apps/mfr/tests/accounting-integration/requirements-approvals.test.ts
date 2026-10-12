// Requirement coverage, against the real test DB, for the approval lifecycle
// as the shareholder sees it (CAP-032): the real inbox and dashboard pages are
// rendered after each action, so "leaves my inbox" and the dashboard tags are
// read from what the pages actually query. Also CAP-039's "approving or
// disputing sends no email".
//
// Deliberately NOT asserted: what the inbox shows for an entry that has since
// been corrected (CAP-032 open question on stale approvals).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/accounting/email'
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
import {
  confirmTransaction,
  disputeTransaction,
  updateDisputeReason,
  resolveDispute,
} from '@/actions/accounting/approvals'
import InboxPage from '@/app/accounting/inbox/page'
import DashboardPage from '@/app/accounting/dashboard/page'
import { formatDate } from '@/lib/accounting/format'
import { ApprovalStatus } from '@/lib/accounting/enums'

function visibleText(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function inboxText(shareholderId: string) {
  vi.mocked(auth).mockResolvedValue(shareholderSession(shareholderId))
  return visibleText(renderToStaticMarkup(await InboxPage()))
}

async function dashboardText(shareholderId: string) {
  vi.mocked(auth).mockResolvedValue(shareholderSession(shareholderId))
  return visibleText(renderToStaticMarkup(await DashboardPage()))
}

/** Records a 250-share purchase for a fresh shareholder; returns its approval id. */
async function purchaseAwaitingApproval(label: string) {
  const sh = await makeShareholder(label)
  vi.mocked(auth).mockResolvedValue(adminSession())
  const result = await createContribution(
    undefined,
    fd({ shareholderId: sh.id, amount: '250', description: 'june purchase' }),
  )
  expect(result).toEqual({ success: true })
  const [t] = await transactionsFor(sh.id)
  const [approval] = await testDb.transactionApproval.findMany({ where: { transactionId: t.id } })
  vi.mocked(sendEmail).mockClear()
  return { sh, transactionId: t.id as string, approvalId: approval.id as string }
}

async function statusOf(approvalId: string) {
  return (await testDb.transactionApproval.findUnique({ where: { id: approvalId } }))?.status
}

beforeEach(() => {
  vi.mocked(sendEmail).mockReset()
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  await cleanupFixtures()
})

describe('CAP-032 Transaction approvals and disputes — lifecycle', () => {
  it('CAP-032 · Confirming an entry clears it from my inbox', async () => {
    const { sh, approvalId } = await purchaseAwaitingApproval('Confirming Miller')
    expect(await inboxText(sh.id)).toContain('june purchase')

    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))
    await confirmTransaction(approvalId)

    const inbox = await inboxText(sh.id)
    expect(inbox).toContain("You're all caught up Nothing pending your approval.")
    expect(inbox).not.toContain('june purchase')
    expect(await dashboardText(sh.id)).toContain('june purchase Approved')
  })

  it('CAP-032 · Disputing needs a reason (server refuses spaces)', async () => {
    const { sh, approvalId } = await purchaseAwaitingApproval('Blank Reason Miller')
    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))

    await expect(disputeTransaction(approvalId, '   ')).rejects.toThrow(
      'A reason is required to dispute a transaction',
    )
    expect(await statusOf(approvalId)).toBe(ApprovalStatus.PENDING)
  })

  it('CAP-032 · A disputed entry leaves the inbox and shows on my dashboard', async () => {
    const { sh, approvalId } = await purchaseAwaitingApproval('Disputing Miller')
    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))

    await disputeTransaction(approvalId, 'Amount is off by 50')

    expect(await inboxText(sh.id)).toContain("You're all caught up")
    const dashboard = await dashboardText(sh.id)
    expect(dashboard).toContain('june purchase Disputed Your dispute: Amount is off by 50')
    // Still counts toward the balance while disputed.
    expect(dashboard).toContain('Shares currently owned 250 ')
  })

  it('CAP-032 · I can change my mind on an open dispute', async () => {
    const { sh, approvalId } = await purchaseAwaitingApproval('Mind Changing Miller')
    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))
    await disputeTransaction(approvalId, 'Amount is off by 50')

    await updateDisputeReason(approvalId, 'Amount is off by 40')
    expect(await dashboardText(sh.id)).toContain('Your dispute: Amount is off by 40')

    vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))
    await confirmTransaction(approvalId) // "Confirm anyway"
    expect(await statusOf(approvalId)).toBe(ApprovalStatus.CONFIRMED)
    const dashboard = await dashboardText(sh.id)
    expect(dashboard).toContain('june purchase Approved')
    expect(dashboard).not.toContain('Your dispute')
  })

  it.each([
    ['with a correction', 'tx-correction-00abc123'],
    ['without a correction', undefined],
  ])(
    'CAP-032 · An admin resolves a dispute with or without a correction (%s)',
    async (_case, correctionId) => {
      const { sh, approvalId } = await purchaseAwaitingApproval('Resolved Miller')
      vi.mocked(auth).mockResolvedValue(shareholderSession(sh.id))
      await disputeTransaction(approvalId, 'Amount is off by 50')

      vi.mocked(auth).mockResolvedValue(adminSession())
      await resolveDispute(approvalId, correctionId)

      const approval = await testDb.transactionApproval.findUnique({ where: { id: approvalId } })
      expect(approval?.status).toBe(ApprovalStatus.DISPUTED)
      const resolved = `Resolved ${formatDate(approval!.resolvedAt!)}`
      const dashboard = await dashboardText(sh.id)
      expect(dashboard).toContain(correctionId ? `${resolved} — correction #abc123` : `${resolved}`)
      if (!correctionId) expect(dashboard).not.toContain('correction #')
      expect(dashboard).not.toContain('Approved')
    },
  )
})

describe('CAP-039 Ledger email notifications — approvals', () => {
  it('CAP-039 · Approving or disputing sends no email', async () => {
    const first = await purchaseAwaitingApproval('Quiet Confirm Miller')
    const second = await purchaseAwaitingApproval('Quiet Dispute Miller')

    vi.mocked(auth).mockResolvedValue(shareholderSession(first.sh.id))
    await confirmTransaction(first.approvalId)
    vi.mocked(auth).mockResolvedValue(shareholderSession(second.sh.id))
    await disputeTransaction(second.approvalId, 'not mine')
    await updateDisputeReason(second.approvalId, 'still not mine')
    vi.mocked(auth).mockResolvedValue(adminSession())
    await resolveDispute(second.approvalId)

    expect(await statusOf(first.approvalId)).toBe(ApprovalStatus.CONFIRMED)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
