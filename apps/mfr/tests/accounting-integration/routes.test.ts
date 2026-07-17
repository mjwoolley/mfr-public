import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { testIdentityDb } from './testIdentityDb'
import { testDb } from './testDb'

// Same reasoning as harness.test.ts for mocking @/lib/auth: the routes gate
// through requireAdmin(), which calls auth() from @/lib/auth.
vi.mock('@/lib/accounting/auth', () => ({ auth: vi.fn() }))

import { auth } from '@/lib/accounting/auth'
import { GET as shareholderSearch } from '@/app/accounting/api/admin/shareholder-search/route'
import { GET as currentYear } from '@/app/accounting/api/contributions/current-year/route'
import { currentFiscalYear } from '@/lib/accounting/fiscalYear'
import { TransactionType } from '@/lib/accounting/enums'

const ADMIN_SESSION = {
  user: {
    id: 'admin-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: true },
    shareholderId: null,
    email: 'admin@example.com',
    name: 'Admin',
  },
  expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const NON_ADMIN_SESSION = {
  user: {
    id: 'member-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
    shareholderId: 'sh-1',
    email: 'member@example.com',
    name: 'Member',
  },
  expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const createdUserIds: string[] = []
const createdShareholderIds: string[] = []
const createdTransactionIds: string[] = []

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {})
  }
  createdTransactionIds.length = 0
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
  for (const id of createdUserIds) {
    await testIdentityDb.delete(users).where(eq(users.id, id))
  }
  createdUserIds.length = 0
})

function searchRequest(email?: string) {
  const url = new URL('http://localhost/accounting/api/admin/shareholder-search')
  if (email !== undefined) url.searchParams.set('email', email)
  return new NextRequest(url)
}

describe('GET /api/admin/shareholder-search', () => {
  it('redirects a non-admin away (requireAdmin gate)', async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
    await expect(shareholderSearch(searchRequest('x@example.com'))).rejects.toThrow()
  })

  it('returns an empty list when no email param is given', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const res = await shareholderSearch(searchRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ users: [] })
  })

  it('returns an empty list for a whitespace-only email', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const res = await shareholderSearch(searchRequest('   '))
    expect(await res.json()).toEqual({ users: [] })
  })

  it('finds identity users by case-insensitive email substring', async () => {
    const email = `route-search-${Date.now()}@example.com`
    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email, name: 'Route Search Target', status: 'approved' })
      .returning()
    createdUserIds.push(identityUser.id)

    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const res = await shareholderSearch(searchRequest(email.toUpperCase()))
    const body = await res.json()

    expect(body.users).toEqual([{ id: identityUser.id, email, name: 'Route Search Target' }])
  })
})

describe('GET /api/contributions/current-year', () => {
  it("reports the current fiscal year's raised total against the goal, cacheable", async () => {
    // Seed one contribution in the current fiscal year for a throwaway
    // shareholder; other suites may add more concurrently, so assert >=.
    const shareholder = await testDb.shareholder.create({
      data: { name: `Current Year Route ${Date.now()}`, email: null },
    })
    createdShareholderIds.push(shareholder.id)
    const transaction = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: 'admin-1',
        entries: { create: { shareholderId: shareholder.id, shares: 123 } },
      },
    })
    createdTransactionIds.push(transaction.id)

    const res = await currentYear()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('s-maxage=60')
    expect(body.year).toBe(currentFiscalYear())
    expect(body.raised).toBeGreaterThanOrEqual(123)
    // goal is either unset (null) or a configured number — both valid states.
    expect(body.goal === null || typeof body.goal === 'number').toBe(true)
  })
})
