import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'

// auth() is mocked so each test hands the actions whatever session it likes;
// redirect() throws (standard Next server-action behavior) so the authz gates'
// unauthorized branches surface as rejections; revalidatePath is a no-op.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { auth } from '@/lib/auth'
import { setUserStatus, setUserRole } from '@/app/admin/users/actions'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { portalUserRoles } from '@/lib/db/schema'

const ownerSession = (id: string) => ({
  user: {
    id,
    status: 'approved',
    roles: { siteOwner: true, siteManager: false, accountingManager: false },
  },
  expires: '2099-01-01',
})
const memberSession = (id: string) => ({
  user: {
    id,
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
  },
  expires: '2099-01-01',
})

async function makeUser(status: 'pending' | 'approved' | 'blocked' = 'pending') {
  const [u] = await identityDb
    .insert(users)
    .values({ email: `um-${randomUUID()}@example.com`, status })
    .returning()
  return u
}

afterEach(() => vi.mocked(auth).mockReset())

describe('user management actions', () => {
  it('lets an owner approve a pending user (persisted to the identity DB)', async () => {
    vi.mocked(auth).mockResolvedValue(ownerSession(randomUUID()) as never)
    const target = await makeUser('pending')

    const res = await setUserStatus({ userId: target.id, status: 'approved' })

    expect(res).toEqual({ ok: true })
    const [row] = await identityDb.select().from(users).where(eq(users.id, target.id))
    expect(row.status).toBe('approved')
  })

  it('lets an owner grant then revoke a role (persisted to the portal DB)', async () => {
    vi.mocked(auth).mockResolvedValue(ownerSession(randomUUID()) as never)
    const target = await makeUser('approved')

    await setUserRole({ userId: target.id, role: 'siteManager', value: true })
    let [row] = await portalDb
      .select()
      .from(portalUserRoles)
      .where(eq(portalUserRoles.identityUserId, target.id))
    expect(row.isSiteManager).toBe(true)

    await setUserRole({ userId: target.id, role: 'siteManager', value: false })
    ;[row] = await portalDb
      .select()
      .from(portalUserRoles)
      .where(eq(portalUserRoles.identityUserId, target.id))
    expect(row.isSiteManager).toBe(false)
  })

  it('rejects a non-owner (site manager) from user management', async () => {
    vi.mocked(auth).mockResolvedValue(memberSession(randomUUID()) as never)
    const target = await makeUser('approved')

    await expect(
      setUserRole({ userId: target.id, role: 'siteManager', value: true }),
    ).rejects.toThrow(/REDIRECT/)
  })

  it("won't let an owner change their own account status (lockout guard)", async () => {
    const ownerId = randomUUID()
    vi.mocked(auth).mockResolvedValue(ownerSession(ownerId) as never)

    const res = await setUserStatus({ userId: ownerId, status: 'blocked' })

    expect(res).toEqual({ error: expect.stringContaining('own account') })
  })

  it("won't let an owner remove their own site-owner role (lockout guard)", async () => {
    const ownerId = randomUUID()
    vi.mocked(auth).mockResolvedValue(ownerSession(ownerId) as never)

    const res = await setUserRole({ userId: ownerId, role: 'siteOwner', value: false })

    expect(res).toEqual({ error: expect.stringContaining('site-owner') })
  })
})
