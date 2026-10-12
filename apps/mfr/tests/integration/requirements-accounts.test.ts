// Requirement coverage (requirements/accounts: CAP-002, CAP-003, CAP-004,
// CAP-005) against the real identity + portal tables. Same mock trio as
// userManagement.test.ts: `auth` is mocked to impersonate each caller,
// redirect() throws, revalidatePath is a no-op. Where a scenario is about the
// NEXT request after a change, the real Auth.js pieces (Drizzle adapter,
// session callback, roles reader) rebuild that request's session from the DB.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import type { Session } from 'next-auth'
import type { AdapterUser } from '@auth/core/adapters'
import { users, sessions, createAuthConfig, createRolesReader } from '@mfr/auth'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { auth } from '@/lib/auth'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { portalUserRoles, portalMealRsvps } from '@/lib/db/schema'
import { setUserStatus, setUserRole } from '@/app/admin/users/actions'
import { toggleMeal } from '@/app/meals/actions'
import { listAdminEmails } from '@/lib/portal/signup'
import { listUsersWithRoles } from '@/lib/users'
import { requireApproved, requirePortalContentAdmin } from '@/lib/authz'

type Status = 'pending' | 'approved' | 'blocked'
type Roles = { siteOwner?: boolean; siteManager?: boolean; accountingManager?: boolean }

const createdUserIds: string[] = []

async function makeUser(status: Status, over: { email?: string; name?: string } = {}) {
  const [u] = await identityDb
    .insert(users)
    .values({
      email: over.email ?? `req-acct-${randomUUID()}@example.com`,
      name: over.name ?? 'Requirements Tester',
      status,
    })
    .returning()
  createdUserIds.push(u.id)
  return u
}

async function giveRoles(userId: string, roles: Roles) {
  await portalDb.insert(portalUserRoles).values({
    identityUserId: userId,
    isSiteOwner: roles.siteOwner ?? false,
    isSiteManager: roles.siteManager ?? false,
    isAccountingManager: roles.accountingManager ?? false,
  })
}

function sessionFor(id: string, status: Status, roles: Roles = {}) {
  return {
    user: {
      id,
      status,
      roles: {
        siteOwner: roles.siteOwner ?? false,
        siteManager: roles.siteManager ?? false,
        accountingManager: roles.accountingManager ?? false,
      },
    },
    expires: '2099-01-01',
  }
}

/**
 * What Auth.js does at the start of every request with a database session:
 * load the session + its users row via the adapter, then run the session
 * callback (which reads the roles table).
 */
async function sessionOnNextRequest(sessionToken: string): Promise<Session> {
  const config = createAuthConfig({
    db: identityDb,
    basePath: '/api/auth',
    getUserRoles: createRolesReader(process.env.DATABASE_URL!),
  })
  const found = await config.adapter!.getSessionAndUser!(sessionToken)
  expect(found).not.toBeNull()
  const cb = config.callbacks!.session! as (p: {
    session: Session
    user: AdapterUser
  }) => Promise<Session>
  return cb({
    session: { user: { email: found!.user.email }, expires: '2099-01-01' } as Session,
    user: found!.user,
  })
}

async function signIn(userId: string) {
  const sessionToken = `req-acct-${randomUUID()}`
  await identityDb
    .insert(sessions)
    .values({ sessionToken, userId, expires: new Date(Date.now() + 86_400_000) })
  return sessionToken
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  if (createdUserIds.length) {
    await portalDb
      .delete(portalMealRsvps)
      .where(inArray(portalMealRsvps.identityUserId, createdUserIds))
    await portalDb
      .delete(portalUserRoles)
      .where(inArray(portalUserRoles.identityUserId, createdUserIds))
    // sessions cascade with the users row
    await identityDb.delete(users).where(inArray(users.id, createdUserIds))
    createdUserIds.length = 0
  }
})

describe('CAP-002 New sign-up handling', () => {
  it('CAP-002 · Anyone else waits for approval and the admins are alerted (every APPROVED role holder)', async () => {
    const owner = await makeUser('approved')
    const manager = await makeUser('approved')
    const accountant = await makeUser('approved')
    const pendingManager = await makeUser('pending')
    const blockedOwner = await makeUser('blocked')
    const noRole = await makeUser('approved')
    await giveRoles(owner.id, { siteOwner: true })
    await giveRoles(manager.id, { siteManager: true })
    await giveRoles(accountant.id, { accountingManager: true })
    await giveRoles(pendingManager.id, { siteManager: true })
    await giveRoles(blockedOwner.id, { siteOwner: true })
    await giveRoles(noRole.id, {}) // a roles row with every role off

    const mine = new Set(
      [owner, manager, accountant, pendingManager, blockedOwner, noRole].map((u) => u.email),
    )
    const alerted = (await listAdminEmails()).filter((e) => mine.has(e))

    expect(alerted.sort()).toEqual([owner.email, manager.email, accountant.email].sort())
  })
})

describe('CAP-003 Access for unapproved accounts', () => {
  it.each(['pending', 'blocked'] as const)(
    'CAP-003 · Unapproved accounts cannot act behind the screens (%s account records a meal)',
    async (status) => {
      const person = await makeUser(status)
      vi.mocked(auth).mockResolvedValue(sessionFor(person.id, status) as never)

      await expect(toggleMeal({ dayIndex: 1, meal: 'L' })).rejects.toThrow('REDIRECT:/')

      const rows = await portalDb
        .select()
        .from(portalMealRsvps)
        .where(eq(portalMealRsvps.identityUserId, person.id))
      expect(rows).toHaveLength(0)
    },
  )

  it('CAP-003 · Blocking takes effect immediately', async () => {
    const ann = await makeUser('approved')
    const token = await signIn(ann.id)

    // Ann is using the site.
    vi.mocked(auth).mockResolvedValue((await sessionOnNextRequest(token)) as never)
    await expect(requireApproved()).resolves.toBeTruthy()

    // A site manager blocks her.
    const manager = await makeUser('approved')
    vi.mocked(auth).mockResolvedValue(
      sessionFor(manager.id, 'approved', { siteManager: true }) as never,
    )
    expect(await setUserStatus({ userId: ann.id, status: 'blocked' })).toEqual({ ok: true })

    // Her next page, on the SAME session, keeps her out.
    const next = await sessionOnNextRequest(token)
    expect(next.user.status).toBe('blocked')
    vi.mocked(auth).mockResolvedValue(next as never)
    await expect(requireApproved()).rejects.toThrow('REDIRECT:/')
  })
})

describe('CAP-004 Admin roles', () => {
  it('CAP-004 · Role changes take effect on my next page', async () => {
    const ann = await makeUser('approved')
    const token = await signIn(ann.id)

    const before = await sessionOnNextRequest(token)
    expect(before.user.roles.siteManager).toBe(false)
    vi.mocked(auth).mockResolvedValue(before as never)
    await expect(requirePortalContentAdmin()).rejects.toThrow('REDIRECT:/')

    // A site owner grants Ann the site manager role.
    const owner = await makeUser('approved')
    vi.mocked(auth).mockResolvedValue(
      sessionFor(owner.id, 'approved', { siteOwner: true }) as never,
    )
    await setUserRole({ userId: ann.id, role: 'siteManager', value: true })

    // Same session, next request: she has the manager's powers.
    const after = await sessionOnNextRequest(token)
    expect(after.user.roles.siteManager).toBe(true)
    vi.mocked(auth).mockResolvedValue(after as never)
    await expect(requirePortalContentAdmin()).resolves.toBeTruthy()
  })
})

describe('CAP-005 User management', () => {
  it('CAP-005 · Everyone who has ever signed in is listed, ordered by email address', async () => {
    const tag = randomUUID()
    const cat = await makeUser('blocked', { email: `c-${tag}@example.com`, name: 'Cat' })
    const ann = await makeUser('approved', { email: `a-${tag}@example.com`, name: 'Ann' })
    const bob = await makeUser('pending', { email: `b-${tag}@example.com`, name: 'Bob' })

    const listed = (await listUsersWithRoles()).filter((u) =>
      u.email.endsWith(`${tag}@example.com`),
    )

    expect(listed.map((u) => [u.email, u.name, u.status])).toEqual([
      [ann.email, 'Ann', 'approved'],
      [bob.email, 'Bob', 'pending'],
      [cat.email, 'Cat', 'blocked'],
    ])
    // And the whole list is in email order, not just my rows.
    const all = (await listUsersWithRoles()).map((u) => u.email)
    expect(all).toEqual([...all].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)))
  })

  it('CAP-005 · Who can open user management (an accounting manager is sent home and changes nothing)', async () => {
    const accountant = await makeUser('approved')
    const target = await makeUser('pending')
    vi.mocked(auth).mockResolvedValue(
      sessionFor(accountant.id, 'approved', { accountingManager: true }) as never,
    )

    await expect(setUserStatus({ userId: target.id, status: 'approved' })).rejects.toThrow(
      'REDIRECT:/',
    )
    const [row] = await identityDb.select().from(users).where(eq(users.id, target.id))
    expect(row.status).toBe('pending')
  })
})
