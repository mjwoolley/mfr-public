import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { users } from '@mfr/auth'

// See apps/reservations/tests/integration/admin.test.ts for the full
// reasoning: the authz helpers under test call requireSession() ->
// auth() from @/lib/auth, whose top-level `NextAuth(createAuthConfig({ db:
// identityDb, ... }))` call would otherwise instantiate a real identityDb
// client (reading IDENTITY_DATABASE_URL, not our TEST_ variant) and pull in
// next-auth machinery that doesn't resolve under plain Vitest. Mocking the
// module lets each test control exactly which session (or none) the authz
// helper sees, without touching real NextAuth at all.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/accounting/authz'

const createdShareholderIds: string[] = []
const createdUserIds: string[] = []

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
  for (const id of createdUserIds) {
    await testIdentityDb.delete(users).where(eq(users.id, id))
  }
  createdUserIds.length = 0
})

describe('integration test harness', () => {
  it('writes a Shareholder via testDb and reads it back from the real test branch', async () => {
    const email = `harness-proof-${Date.now()}-${Math.random()}@example.com`
    const created = await testDb.shareholder.create({
      data: { name: 'Harness Proof', email },
    })
    createdShareholderIds.push(created.id)

    const found = await testDb.shareholder.findUnique({ where: { email } })
    expect(found).not.toBeNull()
    expect(found?.name).toBe('Harness Proof')
  })

  it('writes a user via testIdentityDb and reads it back from the shared identity test branch', async () => {
    const email = `harness-proof-identity-${Date.now()}-${Math.random()}@example.com`
    const [inserted] = await testIdentityDb
      .insert(users)
      .values({ email, status: 'approved' })
      .returning()
    createdUserIds.push(inserted.id)

    const [found] = await testIdentityDb.select().from(users).where(eq(users.id, inserted.id))
    expect(found).toBeDefined()
    expect(found.email).toBe(email)
  })

  it('requireAdmin() resolves for a mocked admin session (no real NextAuth involved)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: 'u1',
        status: 'approved',
        roles: { siteOwner: false, siteManager: false, accountingManager: true },
        shareholderId: null,
        email: 'admin@example.com',
      },
      expires: '2099-01-01',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const session = await requireAdmin()
    expect(session.user.roles.accountingManager).toBe(true)
  })

  it('requireAdmin() redirects (throws) for a mocked non-admin session', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: 'u2',
        status: 'approved',
        roles: { siteOwner: false, siteManager: false, accountingManager: false },
        shareholderId: null,
        email: 'user@example.com',
      },
      expires: '2099-01-01',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(requireAdmin()).rejects.toThrow()
  })
})
