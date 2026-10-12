// Requirements coverage for CAP-008 Site settings (gate + tabs) and the
// page-level rows of CAP-009's "Only site owners and managers see the
// activity feed" (the Activity tab lives under this layout, so its gate is
// this layout's gate). The layout and the real portal gate
// (lib/authz → @mfr/auth) run for real; only auth() and redirect are mocked.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { authMock, pathnameMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  pathnameMock: vi.fn(() => '/admin/schedule'),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({
  usePathname: pathnameMock,
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

// The client feed is covered in activity/ActivityClient.requirements.test.tsx.
vi.mock('./activity/ActivityClient', () => ({ ActivityClient: () => <div>activity feed</div> }))

import AdminLayout from './layout'
import AdminIndexPage from './page'
import ActivityAdminPage from './activity/page'

type RoleKey = 'siteOwner' | 'siteManager' | 'accountingManager'
function sessionWith(role: RoleKey | null) {
  return {
    user: {
      id: 'u1',
      email: 'ann@example.com',
      status: 'approved',
      roles: {
        siteOwner: role === 'siteOwner',
        siteManager: role === 'siteManager',
        accountingManager: role === 'accountingManager',
      },
    },
    expires: '2099-01-01',
  }
}

async function renderLayout(children: React.ReactNode = <p>tab body</p>) {
  return renderToStaticMarkup(await AdminLayout({ children }))
}

beforeEach(() => {
  vi.clearAllMocks()
  pathnameMock.mockReturnValue('/admin/schedule')
})

describe('CAP-008 · Only site owners and managers reach site settings', () => {
  it.each([
    ['site owner', 'siteOwner' as const],
    ['site manager', 'siteManager' as const],
  ])('%s sees "Site settings." on the Schedule tab', async (_label, role) => {
    authMock.mockResolvedValue(sessionWith(role))
    // Opening Admin forwards to the Schedule tab…
    expect(() => AdminIndexPage()).toThrow('NEXT_REDIRECT:/admin/schedule')
    // …which renders inside the admin layout.
    const html = await renderLayout()
    expect(html).toContain('Site settings.')
    expect(html).toMatch(/<a[^>]*href="\/admin\/schedule"[^>]*>Schedule<\/a>/)
  })

  it.each([
    ['accounting manager', 'accountingManager' as const],
    ['member with no role', null],
  ])('%s is taken back to the home page', async (_label, role) => {
    authMock.mockResolvedValue(sessionWith(role))
    await expect(renderLayout()).rejects.toThrow(/NEXT_REDIRECT:\/$/)
  })
})

describe('CAP-008 · The admin area’s tabs', () => {
  it('a site manager sees Schedule, Links, Events, Users and Activity, in that order', async () => {
    authMock.mockResolvedValue(sessionWith('siteManager'))
    const html = await renderLayout()
    const tabs = [...html.matchAll(/<a[^>]*href="\/admin\/[a-z]+"[^>]*>([^<]*)<\/a>/g)].map(
      (m) => m[1],
    )
    expect(tabs).toEqual(['Schedule', 'Links', 'Events', 'Users', 'Activity'])
  })
})

describe('CAP-009 · Only site owners and managers see the activity feed (Activity tab page gate)', () => {
  const activityPage = () => <ActivityAdminPage />

  it.each([
    ['site owner', 'siteOwner' as const],
    ['site manager', 'siteManager' as const],
  ])('%s sees the site activity', async (_label, role) => {
    authMock.mockResolvedValue(sessionWith(role))
    pathnameMock.mockReturnValue('/admin/activity')
    const html = await renderLayout(activityPage())
    expect(html).toContain('Everything members have done across the site')
    expect(html).toContain('activity feed')
  })

  it.each([
    ['accounting manager', 'accountingManager' as const],
    ['member with no role', null],
  ])('%s is taken back to the home page', async (_label, role) => {
    authMock.mockResolvedValue(sessionWith(role))
    await expect(renderLayout(activityPage())).rejects.toThrow(/NEXT_REDIRECT:\/$/)
  })
})

describe('CAP-009 · Photo activity and the automated test account are left out', () => {
  it('tells admins where photo and accounting activity live instead', () => {
    const html = renderToStaticMarkup(<ActivityAdminPage />)
    expect(html).toContain('Photo activity lives on Photos → History')
    expect(html).toContain('accounting activity is under Accounting → Admin')
  })
})
