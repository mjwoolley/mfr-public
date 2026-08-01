import { describe, expect, it, vi, beforeEach } from 'vitest'

const { authMock, redirectMock, settingsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  settingsMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/accounting/settings', () => ({ getAppSettings: settingsMock }))

import ContributionsPage from './page'

function session(overrides: { accountingManager?: boolean; shareholderId?: string | null }) {
  const { accountingManager = false, shareholderId = null } = overrides
  return {
    user: {
      id: 'u1',
      status: 'approved',
      roles: { siteOwner: false, siteManager: false, accountingManager },
      shareholderId,
      email: 'user@example.com',
    },
    expires: '2099-01-01',
  }
}

// The "Contributions: admins only" toggle used to send every non-admin to
// /accounting/dashboard. Now that the books are open to approved users who
// aren't linked to a Shareholder, that destination would bounce them onward to
// /unauthorized — so unlinked users are sent to the ownership report, which is
// never hidden by a toggle.
describe('contributions admins-only visibility gate', () => {
  beforeEach(() => {
    authMock.mockReset()
    redirectMock.mockClear()
    settingsMock.mockReset()
    settingsMock.mockResolvedValue({ id: 'singleton', contributionsVisibleToAll: false })
  })

  it('sends a linked shareholder to their own dashboard', async () => {
    authMock.mockResolvedValue(session({ shareholderId: 'sh_1' }))

    await expect(ContributionsPage()).rejects.toThrow('NEXT_REDIRECT:/accounting/dashboard')
  })

  it('sends an approved user with no shareholder link to ownership, not a dead end', async () => {
    authMock.mockResolvedValue(session({ shareholderId: null }))

    await expect(ContributionsPage()).rejects.toThrow('NEXT_REDIRECT:/accounting/ownership')
  })

  it('does not redirect an accounting admin', async () => {
    authMock.mockResolvedValue(session({ accountingManager: true }))

    // Reaches the data-loading phase instead of redirecting; the dummy unit
    // DATABASE_URL means the query itself fails, which is enough to prove the
    // gate let it through.
    await expect(ContributionsPage()).rejects.not.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
