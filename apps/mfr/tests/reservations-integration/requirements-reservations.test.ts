// Integration: route-level requirement tests for CAP-020, CAP-021, CAP-024,
// CAP-025, CAP-026 and CAP-027 — the rules each API route enforces against
// the real test database (who owns a booking's limit, date changes re-checked
// against every limit, admin-only writes, admin cancelling others' stays).
// Dates are in 2029 so they sit well inside this file's horizon and clear of
// the other integration files' 2027/2028 fixtures.

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { reservations, bookingRules, blockedDates, activityLog } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// See reservations.test.ts for why `auth` is mocked.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// Email content is covered by notifications tests; here we only check which
// owner/actor a route asks to notify.
vi.mock('../../lib/reservations/notifications', () => ({
  sendReservationCreatedEmail: vi.fn(),
  sendReservationUpdatedEmail: vi.fn(),
  sendReservationCancelledEmail: vi.fn(),
}))

// The rules engine runs for real; a test can make ONE call report "valid" to
// reproduce a booking that passed the app check just before someone else's
// overlapping stay committed (the race the DB constraint backstops).
vi.mock('../../lib/reservations/rules/validateReservation', async (importActual) => {
  const actual =
    await importActual<typeof import('../../lib/reservations/rules/validateReservation')>()
  return { ...actual, validateReservation: vi.fn(actual.validateReservation) }
})

import { auth } from '@/lib/auth'
import {
  sendReservationCreatedEmail,
  sendReservationCancelledEmail,
} from '../../lib/reservations/notifications'
import { validateReservation } from '../../lib/reservations/rules/validateReservation'
import { POST, GET } from '../../app/reservations/api/reservations/route'
import { PATCH, DELETE } from '../../app/reservations/api/reservations/[id]/route'
import { POST as createBlock } from '../../app/reservations/api/admin/blocked-dates/route'
import { DELETE as removeBlock } from '../../app/reservations/api/admin/blocked-dates/[id]/route'
import { PATCH as patchRules } from '../../app/reservations/api/admin/booking-rules/route'
import { GET as getHistory } from '../../app/reservations/api/history/route'
import { listApprovedMembers } from '../../lib/users'

const RULES = {
  bookingHorizonDate: '2030-12-31',
  maxConsecutiveNights: 14,
  maxNightsPerUserPerYear: 60,
}
const RACE_MSG =
  'Those dates were just booked or blocked by someone else. Please pick different dates.'
const OVERLAP_MSG = 'Those dates overlap an existing reservation.'
const CAP_2029 = 'This would exceed your 60-night limit for 2029.'

const createdUserIds: string[] = []

async function makeUser(suffix: string, overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await testIdentityDb
    .insert(users)
    .values({
      email: `req-res-${suffix}-${Date.now()}-${Math.random()}@example.com`,
      name: suffix,
      status: 'approved',
      ...overrides,
    })
    .returning()
  createdUserIds.push(user.id)
  return user
}

function actAs(user: { id: string }, isAdmin = false) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      status: 'approved',
      roles: { siteOwner: false, siteManager: isAdmin, accountingManager: false },
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

async function seedStay(userId: string, startDate: string, endDate: string) {
  const [row] = await testDb
    .insert(reservations)
    .values({ userId, startDate, endDate, status: 'confirmed' })
    .returning()
  return row
}

/** 55 confirmed nights in 2029 (14 + 14 + 14 + 13). */
async function seed55Nights(userId: string) {
  await seedStay(userId, '2029-01-01', '2029-01-15')
  await seedStay(userId, '2029-02-01', '2029-02-15')
  await seedStay(userId, '2029-03-01', '2029-03-15')
  await seedStay(userId, '2029-04-01', '2029-04-14')
}

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/reservations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

function cancel(id: string) {
  return DELETE(new NextRequest(`http://localhost/api/reservations/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  })
}

function block(body: unknown) {
  return createBlock(
    new NextRequest('http://localhost/api/admin/blocked-dates', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

async function rowsFor(userId: string) {
  return testDb.select().from(reservations).where(eq(reservations.userId, userId))
}

async function currentRules() {
  const [row] = await testDb.select().from(bookingRules).where(eq(bookingRules.id, 1))
  return row
}

async function resetRules() {
  await testDb
    .insert(bookingRules)
    .values({ id: 1, ...RULES })
    .onConflictDoUpdate({ target: bookingRules.id, set: RULES })
}

beforeAll(resetRules)

afterEach(async () => {
  vi.mocked(auth).mockReset()
  vi.mocked(sendReservationCreatedEmail).mockClear()
  vi.mocked(sendReservationCancelledEmail).mockClear()
  // Restores the real engine and drops any unused one-off result.
  vi.mocked(validateReservation).mockReset()
  if (createdUserIds.length) {
    await testDb.delete(activityLog).where(inArray(activityLog.actorUserId, createdUserIds))
    await testDb.delete(reservations).where(inArray(reservations.userId, createdUserIds))
    await testDb.delete(blockedDates).where(inArray(blockedDates.createdBy, createdUserIds))
    await testIdentityDb.delete(users).where(inArray(users.id, createdUserIds))
    createdUserIds.length = 0
  }
  await resetRules()
})

describe('CAP-020 Book a stay — route level', () => {
  it('CAP-020 · Confirming books the stay immediately (confirmed, no approval step, listed on the calendar)', async () => {
    const me = await makeUser('Me')
    actAs(me)
    const res = await post({ startDate: '2029-06-10', endDate: '2029-06-13' })
    expect(res.status).toBe(201)

    const [row] = await rowsFor(me.id)
    expect(row.status).toBe('confirmed')
    const list = await GET(
      new NextRequest('http://localhost/api/reservations?from=2029-06-01&to=2029-07-01'),
    )
    const listed = (await list.json()).reservations.find((r: { id: string }) => r.id === row.id)
    expect(listed).toMatchObject({ userId: me.id, userName: 'Me', status: 'confirmed' })
  })

  it('CAP-020 · Someone else takes the dates while I am deciding (told they overlap, nothing saved for me)', async () => {
    const carol = await makeUser('Carol')
    const me = await makeUser('Me')
    await seedStay(carol.id, '2029-06-10', '2029-06-13')

    actAs(me)
    const res = await post({ startDate: '2029-06-11', endDate: '2029-06-14' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(OVERLAP_MSG)
    expect(await rowsFor(me.id)).toHaveLength(0)
  })

  it('CAP-020 · Two members confirming the same dates at the same moment (the one past the app check is told the dates were just taken)', async () => {
    const winner = await makeUser('Winner')
    const loser = await makeUser('Loser')
    await seedStay(winner.id, '2029-06-20', '2029-06-23')

    // The loser's app-level check ran before the winner's row committed.
    vi.mocked(validateReservation).mockReturnValueOnce({ valid: true, warnings: [] })
    actAs(loser)
    const res = await post({ startDate: '2029-06-20', endDate: '2029-06-23' })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(RACE_MSG)
    expect(await rowsFor(loser.id)).toHaveLength(0)
    const confirmed = await testDb
      .select()
      .from(reservations)
      .where(and(eq(reservations.startDate, '2029-06-20'), eq(reservations.status, 'confirmed')))
    expect(confirmed).toHaveLength(1)
    expect(sendReservationCreatedEmail).not.toHaveBeenCalled()
  })

  it('CAP-020 · The calendar cannot be used before booking rules exist (booking refused)', async () => {
    const me = await makeUser('Me')
    actAs(me)
    await testDb.delete(bookingRules).where(eq(bookingRules.id, 1))
    try {
      const res = await post({ startDate: '2029-06-10', endDate: '2029-06-13' })
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('Booking rules are not configured yet')
      expect(await rowsFor(me.id)).toHaveLength(0)
    } finally {
      await resetRules()
    }
  })
})

describe('CAP-021 Booking limits — route level', () => {
  it('CAP-021 · An admin booking for a member uses the member’s limit', async () => {
    const admin = await makeUser('Admin')
    const member = await makeUser('Member')
    await seed55Nights(member.id)

    actAs(admin, true)
    const res = await post({ startDate: '2029-08-01', endDate: '2029-08-07', userId: member.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(CAP_2029)
    // Nothing saved: the member still has only the four seeded stays, the admin none.
    expect(await rowsFor(member.id)).toHaveLength(4)
    expect(await rowsFor(admin.id)).toHaveLength(0)
  })

  it('CAP-021 · Rules are enforced even outside the booking screens (refused and nothing is saved)', async () => {
    const carol = await makeUser('Carol')
    const me = await makeUser('Me')
    await seedStay(carol.id, '2029-07-10', '2029-07-13')

    actAs(me)
    const res = await post({ startDate: '2029-07-09', endDate: '2029-07-14' })
    expect(res.status).toBe(400)
    expect(await rowsFor(me.id)).toHaveLength(0)
  })
})

describe('CAP-024 Change or cancel a reservation — route level', () => {
  it.each([
    ['overlapping another member’s stay', '2029-07-10', '2029-07-15', OVERLAP_MSG],
    [
      'longer than 14 nights',
      '2029-07-10',
      '2029-07-25',
      'Reservations cannot exceed 14 consecutive nights.',
    ],
    [
      'starting after the horizon',
      '2031-01-01',
      '2031-01-03',
      "Reservations cannot start after 2030-12-31. That date range isn't open yet.",
    ],
    ['on blocked dates', '2029-07-19', '2029-07-22', 'Those dates are blocked and unavailable.'],
  ])(
    'CAP-024 · New dates must still meet the booking limits (%s)',
    async (_label, startDate, endDate, message) => {
      const me = await makeUser('Me')
      const carol = await makeUser('Carol')
      const mine = await seedStay(me.id, '2029-07-10', '2029-07-13')
      await seedStay(carol.id, '2029-07-14', '2029-07-16')
      await testDb
        .insert(blockedDates)
        .values({ startDate: '2029-07-20', endDate: '2029-07-21', createdBy: me.id })

      actAs(me)
      const res = await patch(mine.id, { startDate, endDate })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe(message)
      const [after] = await testDb.select().from(reservations).where(eq(reservations.id, mine.id))
      expect(after).toMatchObject({ startDate: '2029-07-10', endDate: '2029-07-13' })
    },
  )

  it('CAP-024 · New dates must still meet the booking limits (yearly cap)', async () => {
    const me = await makeUser('Me')
    await seed55Nights(me.id)
    const mine = await seedStay(me.id, '2029-07-10', '2029-07-13') // 58 nights

    actAs(me)
    const res = await patch(mine.id, { startDate: '2029-07-10', endDate: '2029-07-16' }) // 61
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(CAP_2029)
  })

  it('CAP-024 · Someone takes the new dates first (race message, my stay keeps its old dates)', async () => {
    const me = await makeUser('Me')
    const carol = await makeUser('Carol')
    const mine = await seedStay(me.id, '2029-07-10', '2029-07-13')
    await seedStay(carol.id, '2029-07-14', '2029-07-16')

    // My app-level check saw Jul 14 free; Carol's booking committed first.
    vi.mocked(validateReservation).mockReturnValueOnce({ valid: true, warnings: [] })
    actAs(me)
    const res = await patch(mine.id, { startDate: '2029-07-10', endDate: '2029-07-15' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(RACE_MSG)

    const [after] = await testDb.select().from(reservations).where(eq(reservations.id, mine.id))
    expect(after).toMatchObject({ startDate: '2029-07-10', endDate: '2029-07-13' })
    const edits = await testDb
      .select()
      .from(activityLog)
      .where(
        and(eq(activityLog.actorUserId, me.id), eq(activityLog.eventType, 'reservation_edited')),
      )
    expect(edits).toHaveLength(0)
  })

  it('CAP-024 · Other members cannot change or cancel my stay (refused and nothing is saved)', async () => {
    const me = await makeUser('Me')
    const other = await makeUser('Other')
    const mine = await seedStay(me.id, '2029-07-10', '2029-07-13')

    actAs(other)
    expect((await patch(mine.id, { startDate: '2029-07-10', endDate: '2029-07-14' })).status).toBe(
      403,
    )
    expect((await cancel(mine.id)).status).toBe(403)

    const [after] = await testDb.select().from(reservations).where(eq(reservations.id, mine.id))
    expect(after).toMatchObject({
      startDate: '2029-07-10',
      endDate: '2029-07-13',
      status: 'confirmed',
      cancelledAt: null,
    })
  })
})

describe('CAP-025 Manage all reservations — route level', () => {
  it('CAP-025 · A booking made for a member belongs to that member (counts toward Carol’s limit, not mine; Carol is emailed)', async () => {
    const admin = await makeUser('Admin')
    const carol = await makeUser('Carol')
    await seed55Nights(carol.id)
    actAs(admin, true)

    const first = await post({ startDate: '2029-08-01', endDate: '2029-08-06', userId: carol.id })
    expect(first.status).toBe(201)
    expect(sendReservationCreatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: carol.id }),
    )
    // Carol is now at 60: one more night for her is refused…
    const second = await post({ startDate: '2029-08-10', endDate: '2029-08-11', userId: carol.id })
    expect(second.status).toBe(400)
    expect((await second.json()).error).toBe(CAP_2029)
    // …while the admin's own limit is untouched.
    const own = await post({ startDate: '2029-09-01', endDate: '2029-09-15' })
    expect(own.status).toBe(201)
  })

  it('CAP-025 · Only approved members can be chosen (the picker lists approved members by name)', async () => {
    const zed = await makeUser('Zed Requirements')
    const amy = await makeUser('Amy Requirements')
    const pending = await makeUser('Pat Requirements', { status: 'pending' })
    const blocked = await makeUser('Bo Requirements', { status: 'blocked' })

    const ids = new Set([zed.id, amy.id, pending.id, blocked.id])
    const listed = (await listApprovedMembers()).filter((m) => ids.has(m.id))
    expect(listed).toEqual([
      { id: amy.id, name: 'Amy Requirements' },
      { id: zed.id, name: 'Zed Requirements' },
    ])
  })

  it('CAP-025 · I cannot book for someone who is not an approved member (message, nothing saved)', async () => {
    const admin = await makeUser('Admin')
    const pending = await makeUser('Pending', { status: 'pending' })
    actAs(admin, true)

    const res = await post({ startDate: '2029-08-01', endDate: '2029-08-03', userId: pending.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('That member could not be found or is not approved.')
    expect(await rowsFor(pending.id)).toHaveLength(0)
    expect(await rowsFor(admin.id)).toHaveLength(0)
  })

  it('CAP-025 · I change a member’s stay (checked against Carol’s yearly limit)', async () => {
    const admin = await makeUser('Admin')
    const carol = await makeUser('Carol')
    await seed55Nights(carol.id)
    const stay = await seedStay(carol.id, '2029-07-10', '2029-07-13') // Carol at 58
    actAs(admin, true)

    const tooMany = await patch(stay.id, { startDate: '2029-07-10', endDate: '2029-07-16' }) // 61
    expect(tooMany.status).toBe(400)
    expect((await tooMany.json()).error).toBe(CAP_2029)

    const ok = await patch(stay.id, { startDate: '2029-07-10', endDate: '2029-07-15' }) // 60
    expect(ok.status).toBe(200)
    const [after] = await testDb.select().from(reservations).where(eq(reservations.id, stay.id))
    expect(after).toMatchObject({
      userId: carol.id,
      startDate: '2029-07-10',
      endDate: '2029-07-15',
    })
  })

  it('CAP-025 · I cancel a member’s stay (cancelled, gone from the list, Carol emailed that I cancelled)', async () => {
    const admin = await makeUser('Admin')
    const carol = await makeUser('Carol')
    const stay = await seedStay(carol.id, '2029-07-10', '2029-07-13')
    actAs(admin, true)

    const res = await cancel(stay.id)
    expect(res.status).toBe(200)
    const [after] = await testDb.select().from(reservations).where(eq(reservations.id, stay.id))
    expect(after.status).toBe('cancelled')
    expect(after.cancelledAt).not.toBeNull()
    expect(sendReservationCancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: carol.id, actorUserId: admin.id }),
    )

    const list = await GET(
      new NextRequest('http://localhost/api/reservations?from=2029-07-01&to=2029-08-01'),
    )
    const ids = (await list.json()).reservations.map((r: { id: string }) => r.id)
    expect(ids).not.toContain(stay.id)
  })
})

describe('CAP-026 Blocked dates — route level', () => {
  it('CAP-026 · A reason is optional (saved without a reason)', async () => {
    const admin = await makeUser('Admin')
    actAs(admin, true)
    const res = await block({ startDate: '2029-10-01', endDate: '2029-10-10' })
    expect(res.status).toBe(201)
    const rows = await testDb
      .select()
      .from(blockedDates)
      .where(eq(blockedDates.createdBy, admin.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ startDate: '2029-10-01', endDate: '2029-10-10', reason: null })
  })

  it.each(['2029-10-10', '2029-10-09'])(
    'CAP-026 · The end date must be after the start date (Oct 10 → %s refused, nothing blocked)',
    async (endDate) => {
      const admin = await makeUser('Admin')
      actAs(admin, true)
      const res = await block({ startDate: '2029-10-10', endDate })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('endDate must be after startDate')
      const rows = await testDb
        .select()
        .from(blockedDates)
        .where(eq(blockedDates.createdBy, admin.id))
      expect(rows).toHaveLength(0)
    },
  )

  it('CAP-026 · I cannot block dates someone has already booked (message, nothing blocked)', async () => {
    const admin = await makeUser('Admin')
    const carol = await makeUser('Carol')
    await seedStay(carol.id, '2029-10-05', '2029-10-08')
    actAs(admin, true)

    const res = await block({ startDate: '2029-10-01', endDate: '2029-10-10', reason: 'Dock' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(OVERLAP_MSG)
    const rows = await testDb
      .select()
      .from(blockedDates)
      .where(eq(blockedDates.createdBy, admin.id))
    expect(rows).toHaveLength(0)
  })

  it('CAP-026 · Members cannot manage blocked dates (add and remove refused, nothing saved)', async () => {
    const admin = await makeUser('Admin')
    const member = await makeUser('Member')
    const [existing] = await testDb
      .insert(blockedDates)
      .values({ startDate: '2029-11-01', endDate: '2029-11-05', createdBy: admin.id })
      .returning()

    actAs(member)
    const add = await block({ startDate: '2029-12-01', endDate: '2029-12-05' })
    expect(add.status).toBe(403)
    const remove = await removeBlock(new Request('http://localhost'), {
      params: Promise.resolve({ id: existing.id }),
    })
    expect(remove.status).toBe(403)

    const memberBlocks = await testDb
      .select()
      .from(blockedDates)
      .where(eq(blockedDates.createdBy, member.id))
    expect(memberBlocks).toHaveLength(0)
    const still = await testDb.select().from(blockedDates).where(eq(blockedDates.id, existing.id))
    expect(still).toHaveLength(1)
  })
})

describe('CAP-027 Booking rules settings — route level', () => {
  function patchRulesAs(body: unknown) {
    return patchRules(
      new NextRequest('http://localhost/api/admin/booking-rules', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    )
  }

  it('CAP-027 · I change the rules (the activity feed entry carries the new horizon and limits)', async () => {
    const admin = await makeUser('Admin')
    actAs(admin, true)
    const res = await patchRulesAs({ maxConsecutiveNights: 10 })
    expect(res.status).toBe(200)

    const [entry] = await testDb
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.actorUserId, admin.id),
          eq(activityLog.eventType, 'booking_rules_updated'),
        ),
      )
    expect((entry.metadata as { after: unknown }).after).toMatchObject({
      bookingHorizonDate: '2030-12-31',
      maxConsecutiveNights: 10,
      maxNightsPerUserPerYear: 60,
    })
  })

  it('CAP-027 · Tightening a rule does not affect stays already booked', async () => {
    const admin = await makeUser('Admin')
    const member = await makeUser('Member')
    const stay = await seedStay(member.id, '2029-05-01', '2029-05-15') // 14 nights

    actAs(admin, true)
    expect((await patchRulesAs({ maxConsecutiveNights: 10 })).status).toBe(200)

    const [after] = await testDb.select().from(reservations).where(eq(reservations.id, stay.id))
    expect(after).toMatchObject({
      status: 'confirmed',
      startDate: '2029-05-01',
      endDate: '2029-05-15',
    })
  })

  it('CAP-027 · Members cannot change the booking rules (refused and nothing is saved)', async () => {
    const member = await makeUser('Member')
    actAs(member)
    const res = await patchRulesAs({ maxConsecutiveNights: 99 })
    expect(res.status).toBe(403)
    expect(await currentRules()).toMatchObject(RULES)
  })
})

describe('CAP-028 Reservations summary — route level', () => {
  it('CAP-028 · Only confirmed stays that start this year are included (New Year boundaries)', async () => {
    const carol = await makeUser('Carol')
    const year = new Date().getUTCFullYear()
    // Straddles New Year INTO this year: starts last year, so excluded.
    const straddle = await seedStay(carol.id, `${year - 1}-12-30`, `${year}-01-03`)
    // Starts Jan 2 next year: excluded.
    const nextYear = await seedStay(carol.id, `${year + 1}-01-02`, `${year + 1}-01-04`)
    // Starts Dec 30 this year (runs into next year): included.
    const lastOfYear = await seedStay(carol.id, `${year}-12-30`, `${year + 1}-01-01`)
    const [cancelled] = await testDb
      .insert(reservations)
      .values({
        userId: carol.id,
        startDate: `${year}-08-01`,
        endDate: `${year}-08-04`,
        status: 'cancelled',
      })
      .returning()

    actAs(carol)
    const res = await getHistory()
    expect(res.status).toBe(200)
    const ids = (await res.json()).reservations.map((r: { id: string }) => r.id)
    expect(ids).toContain(lastOfYear.id)
    expect(ids).not.toContain(straddle.id)
    expect(ids).not.toContain(nextYear.id)
    expect(ids).not.toContain(cancelled.id)
  })
})
