// Requirement coverage for CAP-003 Access for unapproved accounts
// (requirements/accounts/access-for-unapproved-accounts.md): the text of the
// Reservations and Accounting pending and blocked screens.
//
// Deliberately NOT asserted: "You'll be notified by email once you're
// approved." — CAP-003's [high] open question flags that promise as untrue
// (no approval email is sent).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

import ReservationsPendingPage from './reservations/(public)/pending/page'
import ReservationsBlockedPage from './reservations/(public)/blocked/page'
import AccountingPendingPage from './accounting/pending/page'
import AccountingBlockedPage from './accounting/blocked/page'

const pendingSession = {
  user: { id: 'ann-1', email: 'ann@example.com', status: 'pending' },
  expires: '2099-01-01',
}

beforeEach(() => {
  authMock.mockReset()
  authMock.mockResolvedValue(pendingSession)
})

describe('CAP-003 Access for unapproved accounts', () => {
  it('CAP-003 · Reservations explains a pending account', async () => {
    const html = renderToStaticMarkup(await ReservationsPendingPage())

    expect(html).toContain('Your access is pending approval')
    expect(html).toContain(
      'An admin needs to approve your account before you can view or book the cabin calendar.',
    )
    expect(html).toMatch(/<a[^>]*href="\/reservations\/pending"[^>]*>Check again<\/a>/)
  })

  it('CAP-003 · Accounting explains a pending account', async () => {
    const html = renderToStaticMarkup(await AccountingPendingPage())

    expect(html).toContain('Your access is pending approval')
    expect(html).toContain(
      'An admin needs to approve your account before you can use the family portal.',
    )
    expect(html).toMatch(/<a[^>]*href="\/accounting\/pending"[^>]*>Check again<\/a>/)
  })

  it.each([
    ['Reservations', ReservationsBlockedPage],
    ['Accounting', AccountingBlockedPage],
  ])('CAP-003 · A blocked account is told to contact an admin (%s)', (_section, BlockedPage) => {
    const html = renderToStaticMarkup(<BlockedPage />)

    expect(html).toMatch(/<h1[^>]*>Access unavailable<\/h1>/)
    expect(html).toContain('does not currently have access')
    expect(html).toContain('Contact the site admin if you believe this is a mistake.')
  })
})
