// @vitest-environment happy-dom
// Requirement coverage for the approval inbox (CAP-032): what it tells the
// shareholder, its empty state, and the Confirm / Dispute controls. The
// session and the pending-approval query are stubbed; the actions are spies.
// The approval lifecycle against the real DB is in
// tests/accounting-integration/requirements-approvals.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

const { authMock, db, confirmMock, disputeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  db: { query: { transactionApproval: { findMany: vi.fn() } } },
  confirmMock: vi.fn(),
  disputeMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/db/client', () => ({ db }))
vi.mock('@/actions/accounting/approvals', () => ({
  confirmTransaction: confirmMock,
  disputeTransaction: disputeMock,
}))

import InboxPage from './page'

function pendingApproval(id: string) {
  return {
    id,
    status: 'PENDING',
    transaction: {
      id: `tx-${id}`,
      type: 'CONTRIBUTION',
      createdAt: new Date('2026-06-01T12:00:00Z'),
      description: 'e2e seed contribution',
      inKind: false,
      createdByName: 'Ada Admin',
      createdByEmail: 'admin@example.com',
      entries: [{ shares: '250' }],
    },
  }
}

async function renderInbox() {
  render(await InboxPage())
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({
    user: {
      id: 'u1',
      status: 'approved',
      email: 'anna@example.com',
      roles: { siteOwner: false, siteManager: false, accountingManager: false },
      shareholderId: 'sh-anna',
    },
    expires: '2099-01-01',
  })
  confirmMock.mockResolvedValue(undefined)
  disputeMock.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('CAP-032 Transaction approvals and disputes — inbox', () => {
  it('CAP-032 · Entries count toward balances before and regardless of approval (inbox says so)', async () => {
    db.query.transactionApproval.findMany.mockResolvedValue([pendingApproval('ap-1')])

    await renderInbox()

    const intro = screen.getByRole('heading', { name: 'Inbox' }).nextElementSibling!
    expect(intro.textContent?.replace(/\s+/g, ' ')).toBe(
      "These are already reflected in your balance. Confirming just acknowledges you've seen them — it doesn't change anything. If something looks wrong, dispute it instead.",
    )
  })

  it('CAP-032 · Confirming an entry clears it from my inbox (empty state)', async () => {
    db.query.transactionApproval.findMany.mockResolvedValue([])

    await renderInbox()

    expect(screen.getByText("You're all caught up")).toBeTruthy()
    expect(screen.getByText('Nothing pending your approval.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('CAP-032 · Confirming an entry clears it from my inbox (Confirm sends that approval)', async () => {
    db.query.transactionApproval.findMany.mockResolvedValue([pendingApproval('ap-1')])

    await renderInbox()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith('ap-1'))
  })

  it('CAP-032 · Disputing needs a reason', async () => {
    db.query.transactionApproval.findMany.mockResolvedValue([pendingApproval('ap-1')])

    await renderInbox()
    fireEvent.click(screen.getByRole('button', { name: 'Dispute' }))

    const reason = screen.getByPlaceholderText('Why are you disputing this?')
    const submit = screen.getByRole('button', { name: 'Submit dispute' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.change(reason, { target: { value: '    ' } })
    expect(submit.disabled).toBe(true)

    fireEvent.change(reason, { target: { value: 'Amount is off by 50' } })
    expect(submit.disabled).toBe(false)

    fireEvent.click(submit)
    await waitFor(() => expect(disputeMock).toHaveBeenCalledWith('ap-1', 'Amount is off by 50'))
  })
})
