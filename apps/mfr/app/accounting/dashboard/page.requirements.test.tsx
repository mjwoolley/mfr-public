// @vitest-environment happy-dom
// Requirement coverage for the shareholder dashboard (CAP-031), the approval
// states it shows (CAP-032) and its goal tracker / Venmo option (CAP-041).
// The session, DB reads and ledger totals are stubbed with fixed values; the
// page's own work — sorting the history, tagging entries, the ownership %, the
// goal text — is what's asserted. Which entries the ledger totals include is
// covered against the real DB in tests/accounting-integration/requirements-*.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, within, waitFor } from '@testing-library/react'

const { authMock, db, balanceMock, totalMock, goalMock, venmoMock, raised } = vi.hoisted(() => {
  const raised = { value: '0' }
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => Promise.resolve([{ sum: raised.value }]),
  }
  return {
    authMock: vi.fn(),
    raised,
    db: {
      query: {
        shareholder: { findFirst: vi.fn() },
        ledgerEntry: { findMany: vi.fn() },
      },
      select: vi.fn(() => chain),
    },
    balanceMock: vi.fn(),
    totalMock: vi.fn(),
    goalMock: vi.fn(),
    venmoMock: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/db/client', () => ({ db }))
vi.mock('@/lib/accounting/ledger', () => ({
  getShareholderBalance: balanceMock,
  getTotalSharesOutstanding: totalMock,
}))
vi.mock('@/lib/accounting/goals', async (orig) => ({
  ...(await orig<typeof import('@/lib/accounting/goals')>()),
  getContributionGoal: goalMock,
}))
vi.mock('@/lib/accounting/venmo', () => ({ getVenmoConfig: venmoMock }))
vi.mock('@/actions/accounting/approvals', () => ({
  confirmTransaction: vi.fn(),
  updateDisputeReason: vi.fn(),
}))

import DashboardPage from './page'
import { confirmTransaction, updateDisputeReason } from '@/actions/accounting/approvals'
import { Decimal } from '@/lib/accounting/decimal'

const SHAREHOLDER = { id: 'sh-anna', name: 'Anna Miller', email: null, active: true }

type Approval = {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'DISPUTED'
  disputeReason?: string | null
  resolvedAt?: Date | null
  resolutionTransactionId?: string | null
}

function entry(opts: {
  id: string
  type: 'CONTRIBUTION' | 'TRANSFER' | 'ADJUSTMENT' | 'CORRECTION'
  shares: string
  date: string
  description?: string | null
  inKind?: boolean
  deleted?: boolean
  approval?: Approval
  corrects?: { id: string; type: string }
}) {
  return {
    id: `le-${opts.id}`,
    shareholderId: SHAREHOLDER.id,
    shares: opts.shares,
    transaction: {
      id: opts.id,
      type: opts.type,
      createdAt: new Date(`${opts.date}T12:00:00Z`),
      description: opts.description ?? null,
      inKind: opts.inKind ?? false,
      deleted: opts.deleted ?? false,
      approvals: opts.approval
        ? [
            {
              disputeReason: null,
              resolvedAt: null,
              resolutionTransactionId: null,
              ...opts.approval,
            },
          ]
        : [],
      correctsTransaction: opts.corrects ?? null,
    },
  }
}

async function renderDashboard() {
  render(await DashboardPage())
}

/** The history cards, top to bottom. */
function historyCards() {
  const heading = screen.getByRole('heading', { name: 'Your share purchase history' })
  const list = heading.nextElementSibling as HTMLElement
  return Array.from(list.querySelectorAll<HTMLElement>(':scope > div.card'))
}

function text(el: Element) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

beforeEach(() => {
  vi.clearAllMocks()
  // FY2026 runs Mar 2026 – Feb 2027. Only Date is faked, so React's
  // scheduling still runs on real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
  authMock.mockResolvedValue({
    user: {
      id: 'u1',
      status: 'approved',
      email: 'anna@example.com',
      roles: { siteOwner: false, siteManager: false, accountingManager: false },
      shareholderId: SHAREHOLDER.id,
    },
    expires: '2099-01-01',
  })
  db.query.shareholder.findFirst.mockResolvedValue(SHAREHOLDER)
  db.query.ledgerEntry.findMany.mockResolvedValue([])
  balanceMock.mockResolvedValue(new Decimal(0))
  totalMock.mockResolvedValue(new Decimal(0))
  goalMock.mockResolvedValue(null)
  venmoMock.mockReturnValue(null)
  raised.value = '0'
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CAP-031 Shareholder dashboard', () => {
  it('CAP-031 · I see my shares and my ownership of the house', async () => {
    balanceMock.mockResolvedValue(new Decimal(250))
    totalMock.mockResolvedValue(new Decimal(1000))

    await renderDashboard()

    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Anna Miller')
    const owned = screen.getByText('Shares currently owned').parentElement!
    expect(text(owned)).toBe('Shares currently owned250Each $1 contributed buys 1 share')
    const ownership = screen.getByText('Your ownership').parentElement!
    expect(text(ownership)).toBe('Your ownership25.0%of the lake house')
  })

  it('CAP-031 · My history lists every entry that touched me, newest date first', async () => {
    // Deliberately handed over oldest-first: the page must sort by date.
    db.query.ledgerEntry.findMany.mockResolvedValue([
      entry({
        id: 'tx-purchase',
        type: 'CONTRIBUTION',
        shares: '250',
        date: '2026-01-03',
        description: 'January purchase',
      }),
      entry({
        id: 'tx-transfer',
        type: 'TRANSFER',
        shares: '-100',
        date: '2026-02-05',
        description: 'to Ben',
      }),
    ])

    await renderDashboard()

    const cards = historyCards().map(text)
    expect(cards).toEqual([
      'Transfer-100Feb 5, 2026to Ben',
      'Share purchase+250Jan 3, 2026January purchase',
    ])
  })

  it('CAP-031 · Each entry shows where my approval stands', async () => {
    db.query.ledgerEntry.findMany.mockResolvedValue([
      entry({
        id: 'tx-a',
        type: 'CONTRIBUTION',
        shares: '10',
        date: '2026-06-03',
        approval: { id: 'ap-a', status: 'CONFIRMED' },
      }),
      entry({
        id: 'tx-b',
        type: 'CONTRIBUTION',
        shares: '20',
        date: '2026-06-02',
        approval: { id: 'ap-b', status: 'DISPUTED', disputeReason: 'wrong amount' },
      }),
      entry({
        id: 'tx-c',
        type: 'CONTRIBUTION',
        shares: '30',
        date: '2026-06-01',
        approval: { id: 'ap-c', status: 'PENDING' },
      }),
    ])

    await renderDashboard()

    // The approval block is the last thing on each card; its tag comes first.
    const statusTags = historyCards().map(
      (c) => (c.lastElementChild!.querySelector('span') as HTMLElement).textContent,
    )
    expect(statusTags).toEqual(['Approved', 'Disputed', 'Pending your approval'])
  })

  it('CAP-031 · A corrected entry stays visible but no longer counts', async () => {
    db.query.ledgerEntry.findMany.mockResolvedValue([
      entry({
        id: 'tx-correction-0000abcdef',
        type: 'CORRECTION',
        shares: '60',
        date: '2026-05-01',
        description: 'fix amount',
        corrects: { id: 'tx-original-00123456', type: 'CONTRIBUTION' },
      }),
      entry({
        id: 'tx-original-00123456',
        type: 'CONTRIBUTION',
        shares: '100',
        date: '2026-05-01',
        deleted: true,
      }),
    ])

    await renderDashboard()

    const [correction, original] = historyCards()
    expect(original.className).toContain('line-through')
    expect(text(original)).toContain('Corrected — excluded from your totals.')
    expect(correction.className).not.toContain('line-through')
    expect(text(correction)).toContain('Corrects CONTRIBUTION transaction #123456')
  })

  it('CAP-031 · Empty history', async () => {
    await renderDashboard()

    expect(historyCards()).toHaveLength(0)
    expect(screen.getByText('No share purchases yet.')).toBeTruthy()
  })
})

describe('CAP-032 Transaction approvals and disputes — on the dashboard', () => {
  it('CAP-032 · A disputed entry leaves the inbox and shows on my dashboard', async () => {
    db.query.ledgerEntry.findMany.mockResolvedValue([
      entry({
        id: 'tx-d',
        type: 'CONTRIBUTION',
        shares: '250',
        date: '2026-06-01',
        approval: { id: 'ap-d', status: 'DISPUTED', disputeReason: 'Amount is off by 50' },
      }),
    ])

    await renderDashboard()

    const [card] = historyCards()
    expect(text(card)).toContain('Disputed')
    expect(text(card)).toContain('Your dispute: Amount is off by 50')
    // Still open, so the shareholder can change their mind.
    expect(within(card).getByRole('button', { name: 'Confirm anyway' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Edit reason' })).toBeTruthy()
  })

  it('CAP-032 · I can change my mind on an open dispute (controls)', async () => {
    db.query.ledgerEntry.findMany.mockResolvedValue([
      entry({
        id: 'tx-d',
        type: 'CONTRIBUTION',
        shares: '250',
        date: '2026-06-01',
        approval: { id: 'ap-d', status: 'DISPUTED', disputeReason: 'Amount is off by 50' },
      }),
    ])
    await renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: 'Edit reason' }))
    const reason = screen.getByPlaceholderText('Why are you disputing this?') as HTMLTextAreaElement
    expect(reason.value).toBe('Amount is off by 50')
    fireEvent.change(reason, { target: { value: 'Amount is off by 40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save reason' }))
    await waitFor(() =>
      expect(updateDisputeReason).toHaveBeenCalledWith('ap-d', 'Amount is off by 40'),
    )

    await waitFor(() => screen.getByRole('button', { name: 'Confirm anyway' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm anyway' }))
    await waitFor(() => expect(confirmTransaction).toHaveBeenCalledWith('ap-d'))
  })

  it('CAP-032 · An admin resolves a dispute with or without a correction (shareholder view)', async () => {
    db.query.ledgerEntry.findMany.mockResolvedValue([
      entry({
        id: 'tx-r1',
        type: 'CONTRIBUTION',
        shares: '250',
        date: '2026-06-02',
        approval: {
          id: 'ap-r1',
          status: 'DISPUTED',
          disputeReason: 'Amount is off by 50',
          resolvedAt: new Date('2026-07-04T15:00:00Z'),
          resolutionTransactionId: 'tx-fix-00abc123',
        },
      }),
      entry({
        id: 'tx-r2',
        type: 'CONTRIBUTION',
        shares: '40',
        date: '2026-06-01',
        approval: {
          id: 'ap-r2',
          status: 'DISPUTED',
          disputeReason: 'not mine',
          resolvedAt: new Date('2026-07-05T15:00:00Z'),
        },
      }),
    ])

    await renderDashboard()

    const [withCorrection, withoutCorrection] = historyCards()
    expect(text(withCorrection)).toContain('Resolved Jul 4, 2026 — correction #abc123')
    expect(text(withoutCorrection)).toContain('Resolved Jul 5, 2026')
    expect(text(withoutCorrection)).not.toContain('correction #')
    for (const card of [withCorrection, withoutCorrection]) {
      expect(text(card)).toContain('Disputed')
      expect(text(card)).not.toContain('Approved')
      // A resolved dispute can no longer be edited or confirmed from here.
      expect(within(card).queryByRole('button')).toBeNull()
    }
  })
})

describe('CAP-041 Share purchase goal — dashboard tracker', () => {
  it('CAP-041 · Only share purchases in the current fiscal year count toward the goal (display)', async () => {
    goalMock.mockResolvedValue({ year: 2026, amount: '20000' })
    raised.value = '5000'

    await renderDashboard()

    expect(goalMock).toHaveBeenCalledWith(2026)
    const label = screen.getByText('FY2026 share purchase goal')
    expect(text(label.parentElement!)).toBe('FY2026 share purchase goal5,000 of 20,000 shares')
    expect(screen.getByText('25% funded · 15,000 shares to go')).toBeTruthy()
  })

  it('CAP-041 · Reaching the goal', async () => {
    goalMock.mockResolvedValue({ year: 2026, amount: '20000' })
    raised.value = '21000'

    const { container } = render(await DashboardPage())

    const bar = container.querySelector<HTMLElement>('.rounded-full > .rounded-full')!
    expect(bar.style.width).toBe('100%')
    expect(screen.getByText('Goal met — thank you, everyone!')).toBeTruthy()
  })

  it('CAP-041 · No goal set (with the Venmo card showing)', async () => {
    goalMock.mockResolvedValue(null)
    venmoMock.mockReturnValue({ url: 'https://venmo.com/u/Miller-Lake', handle: '@Miller-Lake' })

    await renderDashboard()

    expect(screen.getByText('No share purchase goal set for FY2026 yet.')).toBeTruthy()
  })

  it('CAP-041 · No goal and no Venmo hides the goal card', async () => {
    goalMock.mockResolvedValue(null)
    venmoMock.mockReturnValue(null)

    await renderDashboard()

    expect(screen.queryByText(/share purchase goal/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Contribute via Venmo' })).toBeNull()
  })

  it('CAP-041 · Contributing through Venmo', async () => {
    goalMock.mockResolvedValue({ year: 2026, amount: '20000' })
    venmoMock.mockReturnValue({ url: 'https://venmo.com/u/Miller-Lake', handle: '@Miller-Lake' })

    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Contribute via Venmo' }))

    const qr = screen.getByAltText('Venmo QR code') as HTMLImageElement
    expect(qr.src).toMatch(/^data:image\/png;base64,/)
    const open = screen.getByRole('link', { name: 'Open Venmo — @Miller-Lake' })
    expect(open.getAttribute('href')).toBe('https://venmo.com/u/Miller-Lake')
    expect(
      screen.getByText(/Share purchases are recorded to the ledger once received\./),
    ).toBeTruthy()
  })

  it("CAP-041 · No Venmo option when it isn't configured", async () => {
    goalMock.mockResolvedValue({ year: 2026, amount: '20000' })
    venmoMock.mockReturnValue(null)

    await renderDashboard()

    expect(screen.getByText('FY2026 share purchase goal')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Contribute via Venmo' })).toBeNull()
  })
})
