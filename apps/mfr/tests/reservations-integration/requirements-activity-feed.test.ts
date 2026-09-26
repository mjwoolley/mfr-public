// Requirements coverage for CAP-009 Site activity feed — the /api/admin/activity
// route behind the Activity tab (requirements/portal/site-activity-feed.md).
// Same seams as memberRoutes.test.ts: auth() is mocked, the DB is real.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { activityLog } from '../../lib/db/schema'
import { users } from '@mfr/auth'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

import { auth } from '@/lib/auth'
import { GET as getActivity } from '../../app/api/admin/activity/route'

type Role = 'siteOwner' | 'siteManager' | 'accountingManager' | null

const createdUserIds: string[] = []
const createdActivityIds: string[] = []

async function signInAs(role: Role) {
  const [user] = await testIdentityDb
    .insert(users)
    .values({
      email: `req-activity-${Date.now()}-${Math.random()}@example.com`,
      name: 'Req Activity Admin',
      status: 'approved',
    })
    .returning()
  createdUserIds.push(user.id)
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      email: user.email,
      status: 'approved',
      roles: {
        siteOwner: role === 'siteOwner',
        siteManager: role === 'siteManager',
        accountingManager: role === 'accountingManager',
      },
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  return user
}

const feed = (query = '') =>
  getActivity(new NextRequest(`http://localhost/api/admin/activity${query}`))

afterEach(async () => {
  vi.mocked(auth).mockReset()
  if (createdActivityIds.length) {
    await testDb.delete(activityLog).where(inArray(activityLog.id, createdActivityIds))
    createdActivityIds.length = 0
  }
  for (const id of createdUserIds) {
    await testDb.delete(activityLog).where(eq(activityLog.actorUserId, id))
    await testIdentityDb.delete(users).where(eq(users.id, id))
  }
  createdUserIds.length = 0
})

describe('CAP-009 · Only site owners and managers see the activity feed', () => {
  it.each([
    ['site owner', 'siteOwner' as const, 200],
    ['site manager', 'siteManager' as const, 200],
    ['accounting manager', 'accountingManager' as const, 403],
    ['member with no role', null, 403],
  ])('%s → %i', async (_label, role, status) => {
    await signInAs(role)
    const res = await feed()
    expect(res.status).toBe(status)
    if (status === 200) expect(Array.isArray((await res.json()).events)).toBe(true)
  })
})

describe('CAP-009 · Newest activity first, 30 at a time', () => {
  it('serves the 30 most recent entries newest first, then the next ones via the cursor', async () => {
    const admin = await signInAs('siteManager')
    // 35 entries dated far in the future so they are the newest rows on the
    // shared test branch regardless of what other suites left behind.
    const base = Date.UTC(2099, 0, 1)
    const inserted = await testDb
      .insert(activityLog)
      .values(
        Array.from({ length: 35 }, (_, i) => ({
          eventType: 'blocked_date_created',
          actorUserId: admin.id,
          metadata: { reqSeq: i },
          createdAt: new Date(base + i * 60_000),
        })),
      )
      .returning({ id: activityLog.id })
    createdActivityIds.push(...inserted.map((r) => r.id))

    const first = await (await feed()).json()
    expect(first.events).toHaveLength(30)
    const seq1 = first.events.map((e: { metadata: { reqSeq: number } }) => e.metadata.reqSeq)
    // Newest first: 34, 33, … 5.
    expect(seq1).toEqual(Array.from({ length: 30 }, (_, k) => 34 - k))
    for (const e of first.events) expect(typeof e.createdAt).toBe('string')
    expect(first.nextCursor).not.toBeNull()

    const second = await (await feed(`?before=${encodeURIComponent(first.nextCursor)}`)).json()
    const seq2 = second.events
      .filter((e: { metadata: { reqSeq?: number } }) => typeof e.metadata?.reqSeq === 'number')
      .map((e: { metadata: { reqSeq: number } }) => e.metadata.reqSeq)
    expect(seq2).toEqual([4, 3, 2, 1, 0])
    // Entries on the next page are older than everything on the first.
    expect(new Date(second.events[0].createdAt).getTime()).toBeLessThan(
      new Date(first.events[29].createdAt).getTime(),
    )
  })
})
