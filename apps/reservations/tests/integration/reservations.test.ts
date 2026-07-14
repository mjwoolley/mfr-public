import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { reservations, bookingRules, activityLog } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// The route handlers under test call `requireApprovedUser()`, which calls
// `auth()` from lib/auth/config.ts. There is no real HTTP session/cookie in
// these tests (we call the route handler functions directly), so `auth` is
// mocked here to return a session for whichever user each test is acting as.
//
// Mocking this module also has a safety side effect worth calling out:
// lib/auth/config.ts's own top-level code (`NextAuth({ adapter:
// DrizzleAdapter(db, ...), ... })`) imports `db` from lib/db/client and would
// otherwise instantiate a second real postgres-js client at import time. With
// the module mocked, that top-level code never runs.
vi.mock('../../lib/auth/config', () => ({ auth: vi.fn() }))

import { auth } from '../../lib/auth/config'
import { POST, GET } from '../../app/reservations/api/reservations/route'
import { PATCH, DELETE } from '../../app/reservations/api/reservations/[id]/route'

const createdUserIds: string[] = []

function mockSessionFor(user: {
  id: string
  isReservationsAdmin?: boolean
  email?: string | null
}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      status: 'approved',
      isReservationsAdmin: user.isReservationsAdmin ?? false,
      isAccountingAdmin: false,
      email: user.email ?? undefined,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

async function makeUser(suffix: string, overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await testIdentityDb
    .insert(users)
    .values({
      email: `res-test-${suffix}-${Date.now()}-${Math.random()}@example.com`,
      status: 'approved',
      ...overrides,
    })
    .returning()
  createdUserIds.push(user.id)
  return user
}

beforeAll(async () => {
  await testDb
    .insert(bookingRules)
    .values({
      id: 1,
      bookingHorizonDate: '2028-12-31',
      maxConsecutiveNights: 7,
      maxNightsPerUserPerYear: 14,
    })
    .onConflictDoUpdate({
      target: bookingRules.id,
      set: {
        bookingHorizonDate: '2028-12-31',
        maxConsecutiveNights: 7,
        maxNightsPerUserPerYear: 14,
      },
    })
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const userId of createdUserIds) {
    await testDb.delete(activityLog).where(eq(activityLog.actorUserId, userId))
    await testDb.delete(reservations).where(eq(reservations.userId, userId))
    await testIdentityDb.delete(users).where(eq(users.id, userId))
  }
  createdUserIds.length = 0
})

describe('POST /api/reservations', () => {
  it('creates a reservation for the authenticated user, visible via testDb (proves the db/testDb seam)', async () => {
    const user = await makeUser('a')
    mockSessionFor(user)
    const request = new Request('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2027-07-01', endDate: '2027-07-05' }),
    })
    const response = await POST(request as never)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.reservation.userId).toBe(user.id)

    // Verification of the db/testDb seam: the route handler used the `db`
    // singleton from lib/db/client.ts, not `testDb`. If the seam did not
    // actually redirect `db` to the TEST branch, this row would not be
    // visible here (or, worse, would have landed in the real dev database).
    const [rowViaTestDb] = await testDb
      .select()
      .from(reservations)
      .where(eq(reservations.id, body.reservation.id))
    expect(rowViaTestDb).toBeDefined()
    expect(rowViaTestDb.startDate).toBe('2027-07-01')

    // Same-transaction activity log verification.
    const activityRows = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.actorUserId, user.id))
    expect(activityRows).toHaveLength(1)
    expect(activityRows[0].eventType).toBe('reservation_created')
  })

  it('rejects with 400 and a reason when validateReservation fails', async () => {
    const user = await makeUser('b')
    mockSessionFor(user)
    const request = new Request('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2029-07-01', endDate: '2029-07-05' }), // past horizon
    })
    const response = await POST(request as never)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('HORIZON')
  })

  it('rejects with 401 when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const request = new Request('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2027-07-01', endDate: '2027-07-05' }),
    })
    const response = await POST(request as never)
    expect(response.status).toBe(401)
  })

  it('stores a 2-night [N, N+2) reservation for a UI-equivalent click on day N then day N+1', async () => {
    // These are the exact startDate/endDate values CalendarClient's fixed
    // click handler (computeSelectionAfterClick) now produces when a user
    // clicks day 2027-10-15 and then day 2027-10-16: the later clicked date
    // is converted to an exclusive checkout date (+1 day) before being sent
    // to the API, matching the half-open [startDate, endDate) convention.
    const user = await makeUser('l')
    mockSessionFor(user)
    const request = new Request('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2027-10-15', endDate: '2027-10-17' }),
    })
    const response = await POST(request as never)
    expect(response.status).toBe(201)
    const body = await response.json()

    const [rowViaTestDb] = await testDb
      .select()
      .from(reservations)
      .where(eq(reservations.id, body.reservation.id))
    expect(rowViaTestDb).toBeDefined()
    expect(rowViaTestDb.startDate).toBe('2027-10-15')
    expect(rowViaTestDb.endDate).toBe('2027-10-17')
  })
})

describe('GET /api/reservations', () => {
  it('lists confirmed reservations overlapping the requested range', async () => {
    const user = await makeUser('c')
    mockSessionFor(user)

    await testDb.insert(reservations).values({
      userId: user.id,
      startDate: '2027-08-01',
      endDate: '2027-08-05',
      status: 'confirmed',
    })
    // Outside the queried range entirely — should not appear.
    await testDb.insert(reservations).values({
      userId: user.id,
      startDate: '2027-01-01',
      endDate: '2027-01-05',
      status: 'confirmed',
    })

    const request = new Request('http://localhost/api/reservations?from=2027-07-01&to=2027-09-01')
    const response = await GET(request as never)
    expect(response.status).toBe(200)
    const body = await response.json()
    const dates = body.reservations.map((r: { startDate: string }) => r.startDate)
    expect(dates).toContain('2027-08-01')
    expect(dates).not.toContain('2027-01-01')
  })

  it('rejects with 400 when from/to are missing', async () => {
    const user = await makeUser('d')
    mockSessionFor(user)
    const request = new Request('http://localhost/api/reservations')
    const response = await GET(request as never)
    expect(response.status).toBe(400)
  })
})

describe('PATCH /api/reservations/[id]', () => {
  it('lets the owner edit their reservation, writing an activity_log row in the same transaction', async () => {
    const user = await makeUser('e')
    mockSessionFor(user)
    const [reservation] = await testDb
      .insert(reservations)
      .values({
        userId: user.id,
        startDate: '2027-06-01',
        endDate: '2027-06-05',
        status: 'confirmed',
      })
      .returning()

    const request = new Request(`http://localhost/api/reservations/${reservation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ startDate: '2027-06-02', endDate: '2027-06-06' }),
    })
    const response = await PATCH(request as never, {
      params: Promise.resolve({ id: reservation.id }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.reservation.startDate).toBe('2027-06-02')

    const [rowViaTestDb] = await testDb
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservation.id))
    expect(rowViaTestDb.endDate).toBe('2027-06-06')

    const activityRows = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.actorUserId, user.id))
    expect(activityRows.some((a) => a.eventType === 'reservation_edited')).toBe(true)
  })

  it("forbids editing another user's reservation", async () => {
    const owner = await makeUser('f')
    const stranger = await makeUser('g')
    const [reservation] = await testDb
      .insert(reservations)
      .values({
        userId: owner.id,
        startDate: '2027-05-01',
        endDate: '2027-05-05',
        status: 'confirmed',
      })
      .returning()

    mockSessionFor(stranger)
    const request = new Request(`http://localhost/api/reservations/${reservation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ startDate: '2027-05-02', endDate: '2027-05-06' }),
    })
    const response = await PATCH(request as never, {
      params: Promise.resolve({ id: reservation.id }),
    })
    expect(response.status).toBe(403)
  })

  it('returns 404 for a nonexistent reservation', async () => {
    const user = await makeUser('h')
    mockSessionFor(user)
    const request = new Request(
      'http://localhost/api/reservations/00000000-0000-0000-0000-000000000000',
      {
        method: 'PATCH',
        body: JSON.stringify({ startDate: '2027-05-02', endDate: '2027-05-06' }),
      },
    )
    const response = await PATCH(request as never, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    })
    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/reservations/[id]', () => {
  it('cancels the reservation and writes an activity_log row in the same transaction', async () => {
    const user = await makeUser('i')
    mockSessionFor(user)
    const [reservation] = await testDb
      .insert(reservations)
      .values({
        userId: user.id,
        startDate: '2027-04-01',
        endDate: '2027-04-05',
        status: 'confirmed',
      })
      .returning()

    const request = new Request(`http://localhost/api/reservations/${reservation.id}`, {
      method: 'DELETE',
    })
    const response = await DELETE(request as never, {
      params: Promise.resolve({ id: reservation.id }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.reservation.status).toBe('cancelled')

    const [rowViaTestDb] = await testDb
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservation.id))
    expect(rowViaTestDb.status).toBe('cancelled')
    expect(rowViaTestDb.cancelledAt).not.toBeNull()

    const activityRows = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.actorUserId, user.id))
    expect(activityRows.some((a) => a.eventType === 'reservation_cancelled')).toBe(true)
  })

  it("forbids cancelling another user's reservation", async () => {
    const owner = await makeUser('j')
    const stranger = await makeUser('k')
    const [reservation] = await testDb
      .insert(reservations)
      .values({
        userId: owner.id,
        startDate: '2027-03-01',
        endDate: '2027-03-05',
        status: 'confirmed',
      })
      .returning()

    mockSessionFor(stranger)
    const request = new Request(`http://localhost/api/reservations/${reservation.id}`, {
      method: 'DELETE',
    })
    const response = await DELETE(request as never, {
      params: Promise.resolve({ id: reservation.id }),
    })
    expect(response.status).toBe(403)
  })
})
