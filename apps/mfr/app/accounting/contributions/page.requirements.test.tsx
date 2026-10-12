// @vitest-environment happy-dom
// Requirement coverage for the Share purchases ledger page (CAP-038) and the
// fiscal-year explainer it carries (CAP-037). The ledger rows and balances are
// stubbed; the page's summary, bars, groupings and corrected-entry handling
// run for real. (The admins-only redirect is in visibilityGate.test.ts.)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

const { authMock, settingsMock, balancesMock, db } = vi.hoisted(() => ({
  authMock: vi.fn(),
  settingsMock: vi.fn(),
  balancesMock: vi.fn(),
  db: { query: { ledgerEntry: { findMany: vi.fn() } } },
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/accounting/settings', () => ({ getAppSettings: settingsMock }))
vi.mock('@/lib/accounting/ledger', () => ({ getAllShareholderBalances: balancesMock }))
vi.mock('@/lib/db/client', () => ({ db }))

import ContributionsPage from './page'
import { Decimal } from '@/lib/accounting/decimal'

const ANNA = { id: 'sh-anna', name: 'Anna Miller' }
const BEN = { id: 'sh-ben', name: 'Ben Miller' }
const CORA = { id: 'sh-cora', name: 'Cora Miller' }

function le(
  who: typeof ANNA,
  type: string,
  shares: number,
  date: string,
  opts: { description?: string; deleted?: boolean } = {},
) {
  return {
    shareholderId: who.id,
    shares: String(shares),
    shareholder: { ...who },
    transaction: {
      type,
      createdAt: new Date(`${date}T12:00:00Z`),
      description: opts.description ?? null,
      inKind: false,
      deleted: opts.deleted ?? false,
    },
  }
}

// FY2004: Anna 1,000 (Jun 2004) + Ben 500 (Feb 2005, still FY2004).
// FY2025: Anna 200. Plus an adjustment, a transfer, and a corrected purchase
// of 9,999 that must count nowhere.
const ENTRIES = [
  le(ANNA, 'CONTRIBUTION', 1000, '2004-06-01', { description: 'down payment' }),
  le(BEN, 'CONTRIBUTION', 500, '2005-02-28'),
  le(ANNA, 'CONTRIBUTION', 200, '2025-07-04', { description: 'dock repair fund' }),
  le(BEN, 'ADJUSTMENT', 25, '2025-08-01', { description: 'reconcile' }),
  le(ANNA, 'TRANSFER', -100, '2025-09-01', { description: 'to Ben' }),
  le(BEN, 'TRANSFER', 100, '2025-09-01', { description: 'to Ben' }),
  le(ANNA, 'CONTRIBUTION', 9999, '2025-09-02', { description: 'typo', deleted: true }),
]

function balance(who: typeof ANNA, shares: number, pct: number) {
  return {
    shareholder: { ...who, active: true },
    shares: new Decimal(shares),
    percent: new Decimal(pct),
  }
}

function session(shareholderId: string | null) {
  return {
    user: {
      id: 'u1',
      status: 'approved',
      email: 'member@example.com',
      roles: { siteOwner: false, siteManager: false, accountingManager: false },
      shareholderId,
    },
    expires: '2099-01-01',
  }
}

function text(el: Element | null) {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Group cards under the grouping heading, as [title, header meta, entry texts]. */
function groups() {
  const heading = screen.getByRole('heading', { level: 2, name: /^Share purchases and transfers/ })
  const list = heading.parentElement!.nextElementSibling!
  return Array.from(list.querySelectorAll<HTMLElement>(':scope > div.card')).map((card) => {
    const header = card.firstElementChild!
    const title = header.firstElementChild!.textContent
    const meta = text(header.lastElementChild)
    const hasYou = Array.from(header.querySelectorAll('span.tag')).some(
      (t) => t.textContent === 'You',
    )
    const entries = Array.from(card.lastElementChild!.children).map((e) => ({
      text: text(e),
      struck: e.className.includes('line-through'),
    }))
    return { title, meta, hasYou, entries }
  })
}

async function renderPage() {
  render(await ContributionsPage())
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
  authMock.mockResolvedValue(session('sh-anna'))
  settingsMock.mockResolvedValue({ id: 'singleton', contributionsVisibleToAll: true })
  db.query.ledgerEntry.findMany.mockResolvedValue(ENTRIES)
  balancesMock.mockResolvedValue({
    total: new Decimal(1725),
    rows: [balance(ANNA, 1100, 63.768), balance(BEN, 625, 36.232), balance(CORA, 0, 0)],
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CAP-038 Share purchases ledger', () => {
  it('CAP-038 · The summary totals purchases, adjustments and shares outstanding', async () => {
    await renderPage()

    const summary = screen.getByRole('heading', {
      level: 1,
      name: 'Share purchases',
    }).nextElementSibling!
    expect(summary.textContent).toBe(
      '1,700 shares purchased since 2004, plus 25 in reconciling adjustments — 1,725 shares outstanding today.',
    )
  })

  it('CAP-038 · Shares sold by year', async () => {
    await renderPage()

    const heading = screen.getByRole('heading', { name: 'Shares sold by year' })
    expect(heading.nextElementSibling!.textContent).toBe(
      'Every dollar contributed buys one share. The founding year raised the down payment.',
    )
    const bars = Array.from(heading.parentElement!.querySelectorAll('[title]')).map((b) =>
      b.getAttribute('title'),
    )
    // Purchases only: no transfer, adjustment or the corrected 9,999.
    expect(bars).toEqual(['2004 — 1,500 shares', '2025 — 200 shares'])
  })

  it('CAP-038 · Grouped by shareholder', async () => {
    await renderPage()

    expect(
      screen.getByRole('heading', { level: 2, name: /^Share purchases and transfers/ }).textContent,
    ).toBe('Share purchases and transfers by shareholder')
    const g = groups()
    expect(g.map(({ title, meta, hasYou }) => ({ title, meta, hasYou }))).toEqual([
      { title: 'Anna Miller', meta: 'Purchased 1,200 · Balance 1,100 · 63.8%', hasYou: true },
      { title: 'Ben Miller', meta: 'Purchased 500 · Balance 625 · 36.2%', hasYou: false },
      { title: 'Cora Miller', meta: 'Purchased 0 · Balance 0 · 0.0%', hasYou: false },
    ])
    expect(g[2].entries.map((e) => e.text)).toEqual(['No entries yet.'])
  })

  it('CAP-038 · Grouped by year', async () => {
    await renderPage()
    fireEvent.click(screen.getByLabelText('By year'))

    expect(
      screen.getByRole('heading', { level: 2, name: /^Share purchases and transfers/ }).textContent,
    ).toBe('Share purchases and transfers by year')
    const g = groups()
    expect(g.map(({ title, meta }) => [title, meta])).toEqual([
      ['FY2025', '200 in new shares'],
      ['FY2004', '1,500 in new shares'],
    ])
    // Every entry carries the shareholder's name.
    expect(g[1].entries.map((e) => e.text)).toEqual([
      'Feb 28, 2005Share purchaseBen Miller+500',
      'Jun 1, 2004Share purchaseAnna Miller — down payment+1,000',
    ])
  })

  it("CAP-038 · Corrected entries stay visible but don't count", async () => {
    await renderPage()

    const anna = groups()[0]
    const corrected = anna.entries.find((e) => e.text.includes('typo'))!
    expect(corrected).toEqual({
      text: 'Sep 2, 2025Share purchasetypo (corrected)+9,999',
      struck: true,
    })
    // Left out of every total on the page: summary, bars and "Purchased".
    const summary = screen.getByRole('heading', {
      level: 1,
      name: 'Share purchases',
    }).nextElementSibling!
    expect(summary.textContent).toMatch(/^1,700 shares purchased since 2004/)
    expect(screen.getByTitle('2025 — 200 shares')).toBeTruthy()
    expect(anna.meta).toBe('Purchased 1,200 · Balance 1,100 · 63.8%')
  })

  it('CAP-038 · No purchases yet', async () => {
    db.query.ledgerEntry.findMany.mockResolvedValue([])
    balancesMock.mockResolvedValue({ total: new Decimal(0), rows: [] })

    await renderPage()

    expect(screen.getByText('No share purchases recorded yet.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Shares sold by year' })).toBeNull()
  })
})

describe('CAP-037 Transaction dates and fiscal year — the explainer', () => {
  it('CAP-037 · The fiscal year is named by the year it starts in', async () => {
    await renderPage()

    expect(screen.getByText(/^The corporation's fiscal year runs March 1/).textContent).toBe(
      "The corporation's fiscal year runs March 1 through the end of February — FY2026 is March 2026 through February 2027.",
    )
  })
})
