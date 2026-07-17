// Integration: the member-visible read routes (blocked-dates, booking-rules,
// activity feed) and the admin blocked-dates list/delete + booking-rules read
// that admin.test.ts (create/patch focused) doesn't reach.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { blockedDates, activityLog } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// See tests/integration/reservations.test.ts for why `auth` is mocked.
vi.mock('../../lib/reservations/auth/config', () => ({ auth: vi.fn() }))

import { auth } from '../../lib/reservations/auth/config'
import { GET as getBlockedDates } from '../../app/reservations/api/blocked-dates/route'
import { GET as getBookingRules } from '../../app/reservations/api/booking-rules/route'
import { GET as getActivity } from '../../app/reservations/api/activity/route'
import {
  GET as adminListBlockedDates,
  POST as adminCreateBlockedDate,
} from '../../app/reservations/api/admin/blocked-dates/route'
import { DELETE as adminDeleteBlockedDate } from '../../app/reservations/api/admin/blocked-dates/[id]/route'
import { GET as adminGetBookingRules } from '../../app/reservations/api/admin/booking-rules/route'

const createdUserIds: string[] = []
const createdBlockedDateIds: string[] = []

async function makeUser(status: 'approved' | 'pending' = 'approved') {
  const [row] = await testIdentityDb
    .insert(users)
    .values({
      email: `member-routes-${Date.now()}-${Math.random()}@example.com`,
      name: 'Member Routes Tester',
      status,
    })
    .returning()
  createdUserIds.push(row.id)
  return row
}

function mockSession(
  user: { id: string; email: string },
  over: { status?: string; siteManager?: boolean } = {},
) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      status: over.status ?? 'approved',
      roles: {
        siteOwner: false,
        siteManager: over.siteManager ?? false,
        accountingManager: false,
      },
      email: user.email,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  if (createdBlockedDateIds.length) {
    await testDb.delete(blockedDates).where(inArray(blockedDates.id, createdBlockedDateIds))
    createdBlockedDateIds.length = 0
  }
  if (createdUserIds.length) {
    await testDb.delete(activityLog).where(inArray(activityLog.actorUserId, createdUserIds))
    for (const id of createdUserIds) {
      await testIdentityDb.delete(users).where(eq(users.id, id))
    }
    createdUserIds.length = 0
  }
})

describe('member read routes', () => {
  it('reject a signed-out caller with 401', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    expect((await getBlockedDates()).status).toBe(401)
    expect((await getBookingRules()).status).toBe(401)
    const activity = await getActivity(
      new NextRequest('http://localhost/reservations/api/activity'),
    )
    expect(activity.status).toBe(401)
  })

  it('hold a pending user at 403', async () => {
    const pending = await makeUser('pending')
    mockSession(pending, { status: 'pending' })

    expect((await getBlockedDates()).status).toBe(403)
    expect((await getBookingRules()).status).toBe(403)
  })

  it('GET /api/blocked-dates lists ranges for an approved member', async () => {
    const member = await makeUser()
    mockSession(member)

    const [seeded] = await testDb
      .insert(blockedDates)
      .values({ startDate: '2044-01-05', endDate: '2044-01-08', createdBy: member.id })
      .returning()
    createdBlockedDateIds.push(seeded.id)

    const res = await getBlockedDates()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.blockedDates.map((b: { id: string }) => b.id)).toContain(seeded.id)
  })

  it('GET /api/booking-rules returns the singleton for an approved member', async () => {
    const member = await makeUser()
    mockSession(member)

    const res = await getBookingRules()
    expect(res.status).toBe(200)
    const body = await res.json()
    // The test branch carries the live singleton (id=1, DB CHECK enforced).
    expect(body.bookingRules).toMatchObject({ id: 1 })
    expect(typeof body.bookingRules.maxConsecutiveNights).toBe('number')
  })
})

describe('GET /api/activity', () => {
  it('returns newest-first events with the user-name map and no cursor on a short page', async () => {
    const member = await makeUser()
    mockSession(member)

    await testDb.insert(activityLog).values({
      eventType: 'blocked_date_created',
      actorUserId: member.id,
      metadata: { probe: 'activity-route' },
    })

    const res = await getActivity(new NextRequest('http://localhost/reservations/api/activity'))
    expect(res.status).toBe(200)
    const body = await res.json()

    const mine = body.events.find(
      (e: { actorUserId: string; metadata: { probe?: string } }) => e.actorUserId === member.id,
    )
    expect(mine?.metadata?.probe).toBe('activity-route')
    expect(body.users[member.id]).toBe('Member Routes Tester')
  })

  it('pages with the before cursor and reports nextCursor on a full page', async () => {
    const member = await makeUser()
    mockSession(member)

    // A full PAGE_SIZE (30) of older events forces a nextCursor; the `before`
    // filter then excludes anything newer than our probe window.
    const base = Date.now() - 1000 * 60 * 60
    await testDb.insert(activityLog).values(
      Array.from({ length: 31 }, (_, i) => ({
        eventType: 'blocked_date_created',
        actorUserId: member.id,
        metadata: { i },
        createdAt: new Date(base + i * 1000),
      })),
    )

    const firstPage = await getActivity(
      new NextRequest('http://localhost/reservations/api/activity'),
    )
    const firstBody = await firstPage.json()
    expect(firstBody.nextCursor).not.toBeNull()

    const paged = await getActivity(
      new NextRequest(
        `http://localhost/reservations/api/activity?before=${encodeURIComponent(
          new Date(base + 5 * 1000).toISOString(),
        )}`,
      ),
    )
    const pagedBody = await paged.json()
    expect(pagedBody.events.length).toBeGreaterThan(0)
    for (const event of pagedBody.events) {
      expect(new Date(event.createdAt).getTime()).toBeLessThan(base + 5 * 1000)
    }
  })
})

describe('admin blocked-dates list/delete and booking-rules read', () => {
  it('reject a non-admin member', async () => {
    const member = await makeUser()
    mockSession(member) // no siteManager role

    expect((await adminListBlockedDates()).status).toBe(403)
    expect((await adminGetBookingRules()).status).toBe(403)
    const del = await adminDeleteBlockedDate(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'irrelevant' }),
    })
    expect(del.status).toBe(403)
  })

  it('lists blocked dates and reads the rules singleton for an admin', async () => {
    const admin = await makeUser()
    mockSession(admin, { siteManager: true })

    const [seeded] = await testDb
      .insert(blockedDates)
      .values({ startDate: '2044-02-05', endDate: '2044-02-08', createdBy: admin.id })
      .returning()
    createdBlockedDateIds.push(seeded.id)

    const list = await adminListBlockedDates()
    expect(list.status).toBe(200)
    expect((await list.json()).blockedDates.map((b: { id: string }) => b.id)).toContain(seeded.id)

    const rules = await adminGetBookingRules()
    expect(rules.status).toBe(200)
    expect((await rules.json()).bookingRules).toMatchObject({ id: 1 })
  })

  it('POST rejects a malformed body and reversed dates', async () => {
    const admin = await makeUser()
    mockSession(admin, { siteManager: true })

    const bad = await adminCreateBlockedDate(
      new NextRequest('http://localhost', { method: 'POST', body: 'not json' }),
    )
    expect(bad.status).toBe(400)

    const reversed = await adminCreateBlockedDate(
      new NextRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ startDate: '2044-03-10', endDate: '2044-03-05' }),
      }),
    )
    expect(reversed.status).toBe(400)
    expect((await reversed.json()).error).toMatch(/after startDate/)
  })

  it('DELETE 404s an unknown id and removes an existing range with an activity entry', async () => {
    const admin = await makeUser()
    mockSession(admin, { siteManager: true })

    const missing = await adminDeleteBlockedDate(new Request('http://localhost'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    })
    expect(missing.status).toBe(404)

    const [seeded] = await testDb
      .insert(blockedDates)
      .values({
        startDate: '2044-04-05',
        endDate: '2044-04-08',
        reason: 'maintenance',
        createdBy: admin.id,
      })
      .returning()
    createdBlockedDateIds.push(seeded.id)

    const res = await adminDeleteBlockedDate(new Request('http://localhost'), {
      params: Promise.resolve({ id: seeded.id }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const remaining = await testDb.select().from(blockedDates).where(eq(blockedDates.id, seeded.id))
    expect(remaining).toHaveLength(0)

    const [entry] = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.actorUserId, admin.id))
    expect(entry.eventType).toBe('blocked_date_removed')
    expect(entry.metadata).toMatchObject({ blockedDateId: seeded.id, reason: 'maintenance' })
  })
})
