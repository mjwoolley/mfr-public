// @vitest-environment happy-dom
// Requirement coverage for the Accounting tab row (CAP-030 tabs, CAP-038 the
// admins-only Share purchases tab). The session, the app-settings singleton and
// the pending-approval count query are stubbed; the tab list, the Inbox badge
// and the lock glyphs are what's under test.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const { authMock, settingsMock, pendingCount, db } = vi.hoisted(() => {
  const pendingCount = { value: 0 }
  const chain = {
    from: () => chain,
    where: () => Promise.resolve([{ count: String(pendingCount.value) }]),
  }
  return {
    authMock: vi.fn(),
    settingsMock: vi.fn(),
    pendingCount,
    db: { select: vi.fn(() => chain) },
  }
})

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/accounting/settings', () => ({ getAppSettings: settingsMock }))
vi.mock('@/lib/db/client', () => ({ db }))
vi.mock('next/navigation', () => ({ usePathname: () => '/accounting/ownership' }))

import { Nav } from './nav'

function session(opts: { admin?: boolean; shareholderId?: string | null }) {
  return {
    user: {
      id: 'u1',
      status: 'approved',
      email: 'member@example.com',
      roles: { siteOwner: false, siteManager: false, accountingManager: opts.admin ?? false },
      shareholderId: opts.shareholderId ?? null,
    },
    expires: '2099-01-01',
  }
}

async function renderNav() {
  const el = await Nav()
  if (el) render(el)
}

/** Each tab as { label, badge, locked }, in display order. */
function tabs() {
  return screen.getAllByRole('link').map((a) => {
    const badge = a.querySelector('span')?.textContent ?? null
    const locked = a.querySelector('svg[aria-label="Admins only"]') !== null
    const label = a.childNodes[0]?.textContent ?? ''
    return { label, badge, locked }
  })
}

function labels() {
  return tabs().map((t) => t.label)
}

beforeEach(() => {
  vi.clearAllMocks()
  pendingCount.value = 0
  settingsMock.mockResolvedValue({ id: 'singleton', contributionsVisibleToAll: true })
})
afterEach(cleanup)

describe('CAP-030 Accounting access and tabs', () => {
  it('CAP-030 · A linked shareholder sees their personal tabs', async () => {
    authMock.mockResolvedValue(session({ shareholderId: 'sh-1' }))
    pendingCount.value = 2

    await renderNav()

    const all = tabs()
    expect(all.slice(0, 2)).toEqual([
      { label: 'Dashboard', badge: null, locked: false },
      { label: 'Inbox', badge: '2', locked: false },
    ])
  })

  it('CAP-030 · An unlinked member does not see personal tabs', async () => {
    authMock.mockResolvedValue(session({ shareholderId: null }))

    await renderNav()

    expect(labels()).toEqual(['Share purchases', 'Ownership', 'Expenses'])
    // No shareholder, so the pending-count query is never run.
    expect(db.select).not.toHaveBeenCalled()
  })

  it('CAP-030 · Accounting admins see a locked Admin tab', async () => {
    authMock.mockResolvedValue(session({ admin: true, shareholderId: null }))

    await renderNav()

    expect(tabs().find((t) => t.label === 'Admin')).toEqual({
      label: 'Admin',
      badge: null,
      locked: true,
    })
  })

  it('non-admins get no Admin tab', async () => {
    authMock.mockResolvedValue(session({ shareholderId: 'sh-1' }))

    await renderNav()

    expect(labels()).not.toContain('Admin')
  })
})

describe('CAP-038 Share purchases ledger — admins-only tab', () => {
  beforeEach(() => {
    settingsMock.mockResolvedValue({ id: 'singleton', contributionsVisibleToAll: false })
  })

  it('CAP-038 · An admin makes the ledger admins-only (members lose the tab)', async () => {
    authMock.mockResolvedValue(session({ shareholderId: 'sh-1' }))

    await renderNav()

    expect(labels()).toEqual(['Dashboard', 'Inbox', 'Ownership', 'Expenses'])
  })

  it('CAP-038 · An admin makes the ledger admins-only (admins keep it, locked)', async () => {
    authMock.mockResolvedValue(session({ admin: true, shareholderId: null }))

    await renderNav()

    expect(tabs().find((t) => t.label === 'Share purchases')).toEqual({
      label: 'Share purchases',
      badge: null,
      locked: true,
    })
  })

  it('the Share purchases tab is unlocked while everyone can see it', async () => {
    settingsMock.mockResolvedValue({ id: 'singleton', contributionsVisibleToAll: true })
    authMock.mockResolvedValue(session({ admin: true, shareholderId: null }))

    await renderNav()

    expect(tabs().find((t) => t.label === 'Share purchases')?.locked).toBe(false)
  })
})
