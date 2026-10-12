// Requirement coverage for who may open the personal and admin views
// (CAP-030). The real authz helpers run against a stubbed session; the pages
// are called directly, so a refusal is the redirect they throw, and the
// "Not authorized" page is rendered to check what the member is told.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { authMock, redirectMock, settingsMock, goalMock, db } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  settingsMock: vi.fn(),
  goalMock: vi.fn(),
  // Any DB read would mean a personal/admin view got past its gate.
  db: new Proxy(
    {},
    {
      get() {
        throw new Error('DB touched before the access gate')
      },
    },
  ),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  usePathname: () => '/accounting/admin',
}))
vi.mock('@/lib/db/client', () => ({ db }))
vi.mock('@/lib/accounting/settings', () => ({ getAppSettings: settingsMock }))
vi.mock('@/lib/accounting/goals', async (orig) => ({
  ...(await orig<typeof import('@/lib/accounting/goals')>()),
  getContributionGoal: goalMock,
}))

import UnauthorizedPage from './page'
import DashboardPage from '../dashboard/page'
import InboxPage from '../inbox/page'
import AdminLayout from '../admin/layout'

function session(opts: { admin?: boolean; shareholderId?: string | null; email?: string }) {
  return {
    user: {
      id: 'u1',
      status: 'approved',
      email: opts.email ?? 'cousin@example.com',
      roles: { siteOwner: false, siteManager: false, accountingManager: opts.admin ?? false },
      shareholderId: opts.shareholderId ?? null,
    },
    expires: '2099-01-01',
  }
}

/** Visible text of the rendered page, entities decoded, whitespace collapsed. */
async function unauthorizedText() {
  const html = renderToStaticMarkup(await UnauthorizedPage())
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CAP-030 Accounting access and tabs', () => {
  it.each([
    ['the shareholder dashboard', () => DashboardPage()],
    ['the approval inbox', () => InboxPage()],
  ])('CAP-030 · Personal views are only for linked shareholders (%s)', async (_view, open) => {
    authMock.mockResolvedValue(session({ shareholderId: null, email: 'cousin@example.com' }))

    await expect(open()).rejects.toThrow('NEXT_REDIRECT:/accounting/unauthorized')

    expect(await unauthorizedText()).toBe(
      "Not authorized cousin@example.com isn't set up as a shareholder yet. Contact the corporation administrator to be added.",
    )
  })

  it('CAP-030 · Being an admin does not unlock personal views', async () => {
    authMock.mockResolvedValue(session({ admin: true, shareholderId: null }))

    await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT:/accounting/unauthorized')
    expect(await unauthorizedText()).toMatch(/^Not authorized /)
  })

  it('CAP-030 · Admin pages are only for accounting admins', async () => {
    authMock.mockResolvedValue(session({ admin: false, shareholderId: 'sh-1' }))

    const child = <p>admin-only child</p>
    await expect(AdminLayout({ children: child })).rejects.toThrow(
      'NEXT_REDIRECT:/accounting/unauthorized',
    )
    // Nothing admin-only was even loaded for the refused member.
    expect(settingsMock).not.toHaveBeenCalled()
    expect(goalMock).not.toHaveBeenCalled()
    expect(await unauthorizedText()).toMatch(/^Not authorized /)
  })

  it('the admin layout lets an accounting admin through', async () => {
    authMock.mockResolvedValue(session({ admin: true, shareholderId: null }))
    settingsMock.mockResolvedValue({ id: 'singleton', contributionsVisibleToAll: true })
    goalMock.mockResolvedValue(null)

    const html = renderToStaticMarkup(await AdminLayout({ children: <p>admin-only child</p> }))

    expect(html).toContain('admin-only child')
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
