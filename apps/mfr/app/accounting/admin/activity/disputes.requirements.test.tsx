// @vitest-environment happy-dom
// Requirement coverage for how the admin activity log shows disputes
// (CAP-032) and its shortcut into the correction form (CAP-036). The feed
// rows are stubbed; the page's dispute labels and links are what's asserted.
// (The activity log itself — ordering, expenses — is CAP-043, covered
// elsewhere.)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react'

const { db } = vi.hoisted(() => ({
  db: {
    query: {
      transaction: { findMany: vi.fn() },
      expense: { findMany: vi.fn() },
    },
  },
}))

vi.mock('@/lib/db/client', () => ({ db }))
vi.mock('@/actions/accounting/approvals', () => ({ resolveDispute: vi.fn() }))

import AdminActivityPage from './page'
import { resolveDispute } from '@/actions/accounting/approvals'

function disputedPurchase(opts: {
  id: string
  resolvedAt?: Date | null
  resolutionTransactionId?: string | null
}) {
  const createdAt = new Date('2026-06-01T12:00:00Z')
  return {
    id: opts.id,
    type: 'CONTRIBUTION',
    createdAt,
    enteredAt: createdAt,
    description: 'June purchase',
    inKind: false,
    deleted: false,
    createdByName: 'Ada Admin',
    createdByEmail: 'admin@example.com',
    entries: [{ shareholderId: 'sh-anna', shares: '250', shareholder: { name: 'Anna Miller' } }],
    approvals: [
      {
        id: `ap-${opts.id}`,
        shareholderId: 'sh-anna',
        status: 'DISPUTED',
        disputeReason: 'Amount is off by 50',
        resolvedAt: opts.resolvedAt ?? null,
        resolutionTransactionId: opts.resolutionTransactionId ?? null,
        shareholder: { name: 'Anna Miller' },
      },
    ],
    correctsTransaction: null,
  }
}

function card() {
  return screen.getByText('Anna Miller +250').closest('div.card') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  db.query.expense.findMany.mockResolvedValue([])
})
afterEach(cleanup)

describe('CAP-032 Transaction approvals and disputes — admin view', () => {
  it('CAP-032 · An admin resolves a dispute with or without a correction (admin view)', async () => {
    db.query.transaction.findMany.mockResolvedValue([
      disputedPurchase({
        id: 'tx-resolved',
        resolvedAt: new Date('2026-07-04T15:00:00Z'),
        resolutionTransactionId: 'tx-fix-00abc123',
      }),
    ])

    render(await AdminActivityPage())

    const c = card()
    expect(within(c).getByText('Anna Miller · Disputed (resolved)')).toBeTruthy()
    expect(within(c).queryByText(/Confirmed/)).toBeNull()
    expect(c.textContent).toContain('Resolved Jul 4, 2026 — correction #abc123')
    expect(within(c).queryByRole('link', { name: 'Issue correction' })).toBeNull()
  })
})

describe('CAP-032 Transaction approvals and disputes — Mark resolved', () => {
  it.each([
    ['with a correction', 'tx-fix-00abc123', 'tx-fix-00abc123'],
    ['without a correction', '', undefined],
  ])(
    'CAP-032 · An admin resolves a dispute with or without a correction (%s)',
    async (_case, typed, sent) => {
      vi.mocked(resolveDispute).mockResolvedValue(undefined)
      db.query.transaction.findMany.mockResolvedValue([disputedPurchase({ id: 'tx-open' })])
      render(await AdminActivityPage())

      fireEvent.click(within(card()).getByRole('button', { name: 'Mark resolved' }))
      if (typed) {
        fireEvent.change(screen.getByPlaceholderText('Correction transaction id (optional)'), {
          target: { value: typed },
        })
      }
      fireEvent.click(screen.getByRole('button', { name: 'Confirm resolved' }))

      await waitFor(() => expect(resolveDispute).toHaveBeenCalledWith('ap-tx-open', sent))
    },
  )
})

describe('CAP-036 Transaction corrections — from a dispute', () => {
  it("CAP-036 · An admin can go straight to a disputed entry's correction", async () => {
    db.query.transaction.findMany.mockResolvedValue([disputedPurchase({ id: 'tx-open-dispute' })])

    render(await AdminActivityPage())

    const c = card()
    expect(within(c).getByText('Anna Miller · Disputed')).toBeTruthy()
    const link = within(c).getByRole('link', { name: 'Issue correction' })
    // The transactions screen opens the correction form for ?correct=<id>
    // (asserted in admin/transactions/transactions.requirements.test.tsx).
    expect(link.getAttribute('href')).toBe('/accounting/admin/transactions?correct=tx-open-dispute')
  })
})
