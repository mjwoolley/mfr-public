// Requirement coverage for the approval gate and admin-role checks
// (requirements/accounts: CAP-003, CAP-004, CAP-005). The real gates run —
// only the session source (`auth`) and Next's redirect are stubbed — and the
// real member pages are opened, so a page that forgot its gate fails here.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: redirectMock, notFound: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Data reads behind the gates: any call means the gate let the person through.
const { dataRead } = vi.hoisted(() => ({ dataRead: vi.fn() }))
vi.mock('@/lib/portal', () => ({
  getPortalSettings: () => dataRead('settings'),
  getMealsView: () => dataRead('meals'),
  getEvents: () => dataRead('events'),
}))
vi.mock('@/lib/users', () => ({ listUsersWithRoles: () => dataRead('users') }))

import { requireApproved, requirePortalContentAdmin, requireUserAdmin } from './authz'
import { gatePortalStatus as reservationsGate } from './reservations/auth/portalStatusGate'
import { requirePortalApproved, requireAdmin as requireAccountingAdmin } from './accounting/authz'
import MealsPage from '@/app/meals/page'
import DocumentsPage from '@/app/documents/page'
import PhotosPage from '@/app/photos/page'
import AdminLayout from '@/app/admin/layout'
import UsersAdminPage from '@/app/admin/users/page'

type Status = 'pending' | 'approved' | 'blocked'
type RoleName = 'siteOwner' | 'siteManager' | 'accountingManager'

function session(status: Status, ...roles: RoleName[]) {
  return {
    user: {
      id: 'ann-1',
      email: 'ann@example.com',
      status,
      roles: {
        siteOwner: roles.includes('siteOwner'),
        siteManager: roles.includes('siteManager'),
        accountingManager: roles.includes('accountingManager'),
      },
    },
    expires: '2099-01-01',
  }
}

const PAGES: Record<string, () => Promise<unknown>> = {
  Meals: () => MealsPage(),
  Documents: () =>
    (DocumentsPage as (p: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>)({
      searchParams: Promise.resolve({}),
    }),
  Photos: () => PhotosPage(),
  Admin: () => AdminLayout({ children: null }),
}

beforeEach(() => {
  authMock.mockReset()
  redirectMock.mockClear()
  dataRead.mockReset()
  dataRead.mockImplementation(async () => {
    throw new Error('DATA_READ')
  })
})

describe('CAP-003 · Only approved accounts reach member pages', () => {
  it.each([
    ['pending', 'Meals'],
    ['blocked', 'Meals'],
    ['pending', 'Documents'],
    ['pending', 'Photos'],
    ['pending', 'Admin'],
  ] as const)(
    'CAP-003 · %s account opening %s is taken back to the home page',
    async (status, page) => {
      // Give the Admin row a site-manager role so only the approval gate can stop it.
      authMock.mockResolvedValue(session(status, 'siteManager'))

      await expect(PAGES[page]()).rejects.toThrow('NEXT_REDIRECT:/')
      expect(redirectMock).toHaveBeenCalledTimes(1)
      expect(redirectMock).toHaveBeenCalledWith('/')
      expect(dataRead).not.toHaveBeenCalled()
    },
  )

  it('CAP-003 · approved account opening Meals gets past the gate', async () => {
    authMock.mockResolvedValue(session('approved'))

    await expect(PAGES.Meals()).rejects.toThrow('DATA_READ')
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it.each([
    ['pending', '/reservations/pending', '/accounting/pending'],
    ['blocked', '/reservations/blocked', '/accounting/blocked'],
  ] as const)(
    'CAP-003 · %s account is sent to the Reservations and Accounting %s screens',
    async (status, reservationsPath, accountingPath) => {
      const s = session(status)
      expect(() => reservationsGate(s as never)).toThrow(`NEXT_REDIRECT:${reservationsPath}`)

      authMock.mockResolvedValue(s)
      await expect(requirePortalApproved()).rejects.toThrow(`NEXT_REDIRECT:${accountingPath}`)
    },
  )
})

describe('CAP-003 · Blocking takes effect immediately', () => {
  it('CAP-003 · a session that now reads blocked is kept out of every section', async () => {
    // (That the session re-reads the status on each request is asserted in
    // packages/auth/src/config.requirements.test.ts.)
    authMock.mockResolvedValue(session('approved'))
    await expect(requireApproved()).resolves.toBeTruthy()

    authMock.mockResolvedValue(session('blocked'))
    await expect(requireApproved()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(() => reservationsGate(session('blocked') as never)).toThrow(
      'NEXT_REDIRECT:/reservations/blocked',
    )
    await expect(requirePortalApproved()).rejects.toThrow('NEXT_REDIRECT:/accounting/blocked')
  })
})

describe('CAP-004 · Roles only count once the account is approved', () => {
  it.each(['pending', 'blocked'] as const)(
    'CAP-004 · a %s site manager is kept out of the admin area',
    async (status) => {
      authMock.mockResolvedValue(session(status, 'siteManager'))

      await expect(requirePortalContentAdmin()).rejects.toThrow('NEXT_REDIRECT:/')
      await expect(requireUserAdmin()).rejects.toThrow('NEXT_REDIRECT:/')
      await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/')
    },
  )

  it.each([
    ['pending', '/accounting/pending'],
    ['blocked', '/accounting/blocked'],
  ] as const)(
    'CAP-004 · a %s accounting manager is kept out of accounting admin like any unapproved account',
    async (status, path) => {
      authMock.mockResolvedValue(session(status, 'accountingManager'))

      await expect(requireAccountingAdmin()).rejects.toThrow(`NEXT_REDIRECT:${path}`)
    },
  )
})

describe('CAP-005 · Who can open user management', () => {
  it.each([
    ['site owner', 'siteOwner'],
    ['site manager', 'siteManager'],
  ] as const)('CAP-005 · an approved %s gets the "User management" list', async (_label, role) => {
    authMock.mockResolvedValue(session('approved', role))

    // The gate lets them through to the list read.
    await expect(UsersAdminPage()).rejects.toThrow('DATA_READ')
    expect(dataRead).toHaveBeenCalledWith('users')
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it.each([
    ['accounting manager', ['accountingManager'] as RoleName[]],
    ['member with no role', [] as RoleName[]],
  ])('CAP-005 · an approved %s is taken back to the home page', async (_label, roles) => {
    authMock.mockResolvedValue(session('approved', ...roles))

    await expect(UsersAdminPage()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(redirectMock).toHaveBeenCalledWith('/')
    expect(dataRead).not.toHaveBeenCalled()
  })
})
