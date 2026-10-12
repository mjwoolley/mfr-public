// Requirements coverage for CAP-007 Site navigation
// (requirements/portal/site-navigation.md). The root layout is rendered for
// real — including the real role checks from @mfr/auth that decide the Admin
// tab — with auth and the settings reader mocked.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { authMock, settingsMock, pathnameMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  settingsMock: vi.fn(),
  pathnameMock: vi.fn(() => '/'),
}))

vi.mock('next/font/google', () => ({
  Caprasimo: () => ({ variable: 'font-caprasimo' }),
  Figtree: () => ({ variable: 'font-figtree' }),
}))
vi.mock('next/navigation', () => ({ usePathname: pathnameMock }))
vi.mock('@/lib/auth', () => ({ auth: authMock, signOut: vi.fn() }))
vi.mock('@/lib/portal', () => ({ getPortalSettings: settingsMock }))

import RootLayout from './layout'

const settings = {
  id: 'singleton',
  reunionYear: 2026,
  reunionStart: null,
  reunionEnd: null,
  driveUrl: '',
  venmoUrl: '',
  chatUrl: '',
  updatedAt: new Date(),
}

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
  }
}

async function render() {
  return renderToStaticMarkup(await RootLayout({ children: <p>page body</p> }))
}

/** The <nav> markup only, so header/footer text can't satisfy a nav assertion. */
function navOf(html: string) {
  const afterHeader = html.slice(html.indexOf('</header>'))
  const m = afterHeader.match(/<nav[\s\S]*?<\/nav>/)
  expect(m).not.toBeNull()
  return m![0]
}

function headerOf(html: string) {
  const m = html.match(/<header[\s\S]*<\/header>/)
  expect(m).not.toBeNull()
  return m![0]
}

beforeEach(() => {
  vi.clearAllMocks()
  pathnameMock.mockReturnValue('/')
  settingsMock.mockResolvedValue(settings)
  authMock.mockResolvedValue(null)
})

describe('CAP-007 Site navigation', () => {
  it('CAP-007 · Every visitor sees the section tabs', async () => {
    const nav = navOf(await render())
    for (const [href, label] of [
      ['/', 'Home'],
      ['/reservations', 'Reservations'],
      ['/accounting', 'Accounting'],
      ['/photos', 'Photos'],
      ['/meals', 'Meals'],
      ['/documents', 'Documents'],
    ]) {
      expect(nav).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>${label}</a>`))
    }
  })

  it('CAP-007 · Every visitor sees the section tabs — the current section is highlighted', async () => {
    pathnameMock.mockReturnValue('/meals')
    const nav = navOf(await render())
    const current = [...nav.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map(
      (m) => m[1],
    )
    expect(current).toEqual(['Meals'])
  })

  it('CAP-007 · Every visitor sees the section tabs — a sub-page highlights its section, not Home', async () => {
    pathnameMock.mockReturnValue('/accounting/dashboard')
    const nav = navOf(await render())
    const current = [...nav.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map(
      (m) => m[1],
    )
    expect(current).toEqual(['Accounting'])
  })

  it('CAP-007 · Family Chat opens the family’s chat space separately', async () => {
    settingsMock.mockResolvedValue({ ...settings, chatUrl: 'https://chat.google.com/room/FAMILY' })
    const nav = navOf(await render())
    expect(nav).toMatch(
      /<a[^>]*href="https:\/\/chat.google.com\/room\/FAMILY"[^>]*target="_blank"[^>]*>Family Chat/,
    )
  })

  it('CAP-007 · Family Chat falls back to Google Chat', async () => {
    settingsMock.mockResolvedValue({ ...settings, chatUrl: '' })
    const nav = navOf(await render())
    expect(nav).toMatch(
      /<a[^>]*href="https:\/\/chat.google.com\/"[^>]*target="_blank"[^>]*>Family Chat/,
    )
  })

  describe('CAP-007 · The Admin tab shows only for site admins', () => {
    it.each([
      ['site owner', 'siteOwner' as const, true],
      ['site manager', 'siteManager' as const, true],
      ['accounting manager', 'accountingManager' as const, false],
      ['member with no role', null, false],
    ])('%s → Admin tab shown: %s', async (_label, role, shown) => {
      authMock.mockResolvedValue(sessionWith(role))
      const nav = navOf(await render())
      if (shown) expect(nav).toMatch(/<a[^>]*href="\/admin"[^>]*>[\s\S]*?Admin<\/a>/)
      else {
        expect(nav).not.toContain('href="/admin"')
        expect(nav).not.toContain('Admin')
      }
    })
  })

  it('CAP-007 · Signed-out visitors get a sign-in link', async () => {
    authMock.mockResolvedValue(null)
    const header = headerOf(await render())
    expect(header).toMatch(/<a[^>]*href="\/sign-in"[^>]*>Sign in<\/a>/)
    expect(header).not.toContain('Sign out')
  })

  it('CAP-007 · The header shows who I am signed in as (no sign-in link when signed in)', async () => {
    authMock.mockResolvedValue(sessionWith(null))
    const header = headerOf(await render())
    expect(header).toContain('ann@example.com')
    expect(header).toContain('Sign out')
    expect(header).not.toContain('href="/sign-in"')
  })
})
