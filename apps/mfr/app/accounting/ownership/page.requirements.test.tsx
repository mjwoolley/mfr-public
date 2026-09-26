// @vitest-environment happy-dom
// Requirement coverage for the ownership report (CAP-040). The balances come
// from a stubbed getAllShareholderBalances; which ledger entries those
// balances include (corrected originals, unapproved entries) is checked
// against the real DB in tests/accounting-integration/requirements-ledger.test.ts.
//
// Deliberately NOT asserted: the "100.00%" footer and negative-balance rows —
// CAP-040's open question asks whether the report should list or warn about
// them.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const { authMock, balancesMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  balancesMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/accounting/ledger', () => ({ getAllShareholderBalances: balancesMock }))

import OwnershipPage from './page'
import { Decimal } from '@/lib/accounting/decimal'

function row(id: string, name: string, shares: number, total: number) {
  return {
    shareholder: { id, name, email: null, active: true },
    shares: new Decimal(shares),
    percent: new Decimal(shares).div(total).mul(100),
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

/** Body rows as [name, shares, percent] (the "You" tag stripped from the name). */
function bodyRows() {
  return Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
    const cells = Array.from(tr.querySelectorAll('td'))
    const name = cells[0].querySelector('span')!.firstChild!.textContent
    return [name, cells[1].textContent, cells[2].textContent]
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue(session(null))
  // Names are alphabetical (the lib's order) but balances are not, so the
  // page's largest-first sort is what's being checked.
  balancesMock.mockResolvedValue({
    total: new Decimal(1000),
    rows: [
      row('sh-anna', 'Anna Miller', 200, 1000),
      row('sh-ben', 'Ben Miller', 500, 1000),
      row('sh-cora', 'Cora Miller', 0, 1000),
      row('sh-dale', 'Dale Miller', 300, 1000),
    ],
  })
})
afterEach(cleanup)

describe('CAP-040 Ownership report', () => {
  it('CAP-040 · Every current owner with their shares and percentage', async () => {
    render(await OwnershipPage())

    expect(screen.getByText(/shares outstanding across/).textContent).toBe(
      '1,000 shares outstanding across 3 shareholders.',
    )
    expect(bodyRows()).toEqual([
      ['Ben Miller', '500', '50.00%'],
      ['Dale Miller', '300', '30.00%'],
      ['Anna Miller', '200', '20.00%'],
    ])
  })

  it('CAP-040 · Shareholders with nothing are left out', async () => {
    render(await OwnershipPage())

    expect(bodyRows().map(([name]) => name)).not.toContain('Cora Miller')
    expect(screen.queryByText('Cora Miller')).toBeNull()
  })

  it('CAP-040 · My own row is highlighted', async () => {
    authMock.mockResolvedValue(session('sh-dale'))

    render(await OwnershipPage())

    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'))
    const highlighted = rows.filter((tr) => tr.style.background !== '')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].textContent).toBe('Dale MillerYou30030.00%')
    expect(screen.getAllByText('You')).toHaveLength(1)
  })
})
