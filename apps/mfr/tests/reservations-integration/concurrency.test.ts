// Integration: two simultaneous bookings for the same dates — exactly one
// wins; the loser gets the DB exclusion-constraint 409, not a double booking.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { reservations, bookingRules, activityLog } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// See tests/integration/reservations.test.ts for why `auth` is mocked and
// what that implies about the db/testDb seam (env override lives in
// vitest.config.ts, applied by the runner before this file's module graph
// evaluates — see the comment there for why a plain top-of-file
// `process.env.DATABASE_URL = ...` assignment does not reliably work).
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// POST sends a notification email after commit; mock the notifications
// module so this file neither queries the identity DB nor calls SES.
vi.mock('../../lib/reservations/notifications', () => ({
  sendReservationCreatedEmail: vi.fn(),
  sendReservationUpdatedEmail: vi.fn(),
  sendReservationCancelledEmail: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { POST } from '../../app/reservations/api/reservations/route'

const createdUserIds: string[] = []

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const userId of createdUserIds) {
    await testDb.delete(activityLog).where(eq(activityLog.actorUserId, userId))
    await testDb.delete(reservations).where(eq(reservations.userId, userId))
    await testIdentityDb.delete(users).where(eq(users.id, userId))
  }
  createdUserIds.length = 0
})

async function runRaceOnce(dateSuffix: string) {
  await testDb
    .insert(bookingRules)
    .values({
      id: 1,
      bookingHorizonDate: '2028-12-31',
      maxConsecutiveNights: 30,
      maxNightsPerUserPerYear: 60,
    })
    .onConflictDoUpdate({
      target: bookingRules.id,
      set: {
        bookingHorizonDate: '2028-12-31',
        maxConsecutiveNights: 30,
        maxNightsPerUserPerYear: 60,
      },
    })

  const userA = await testIdentityDb
    .insert(users)
    .values({ email: `race-a-${dateSuffix}-${Date.now()}@example.com`, status: 'approved' })
    .returning()
    .then((r) => r[0])
  const userB = await testIdentityDb
    .insert(users)
    .values({ email: `race-b-${dateSuffix}-${Date.now()}@example.com`, status: 'approved' })
    .returning()
    .then((r) => r[0])
  createdUserIds.push(userA.id, userB.id)

  // requireApprovedUser() -> requireUser() -> `await auth()` is the very
  // first thing each POST call does, before any other await. Calling
  // POST(reqA) and POST(reqB) synchronously in this order (as array
  // elements, evaluated left-to-right, both inside the same Promise.all
  // call below) means the underlying `auth` mock is *invoked* in that same
  // order — even though its resolution is deferred — so mockResolvedValueOnce
  // pairs deterministically with which request each session belongs to.
  // (This ordering isn't actually load-bearing for the race proof itself:
  // the reservations_no_overlap EXCLUDE constraint in
  // drizzle/0001_overlap_constraints.sql has no user_id in its predicate —
  // it blocks ANY two overlapping confirmed reservations globally,
  // regardless of which user each belongs to.)
  vi.mocked(auth)
    .mockResolvedValueOnce({
      user: {
        id: userA.id,
        status: 'approved',
        roles: { siteOwner: false, siteManager: false, accountingManager: false },
        email: userA.email,
      },
      expires: '2099-01-01',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .mockResolvedValueOnce({
      user: {
        id: userB.id,
        status: 'approved',
        roles: { siteOwner: false, siteManager: false, accountingManager: false },
        email: userB.email,
      },
      expires: '2099-01-01',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

  const makeRequest = () =>
    new Request('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        startDate: `2027-09-${dateSuffix}`,
        endDate: `2027-09-${String(Number(dateSuffix) + 4).padStart(2, '0')}`,
      }),
    })

  // Both requests target the SAME dates from DIFFERENT users, fired
  // simultaneously — this is what the M1 database exclusion constraint
  // exists to resolve when application-level checks race (both read the
  // "no existing overlap" state before either commits).
  const [responseA, responseB] = await Promise.all([
    POST(makeRequest() as never),
    POST(makeRequest() as never),
  ])

  return { responseA, responseB, userA, userB }
}

describe('concurrent booking race', () => {
  it('allows exactly one of two simultaneous overlapping POSTs to succeed (run 1)', async () => {
    const { responseA, responseB } = await runRaceOnce('01')
    const statuses = [responseA.status, responseB.status].sort()
    expect(statuses).toEqual([201, 409])

    // Confirm the database itself ended up with exactly one confirmed
    // reservation for these dates — the app-level statuses agree with what
    // actually landed in the table, proving this isn't just the app
    // guessing right.
    const rows = await testDb
      .select()
      .from(reservations)
      .where(eq(reservations.startDate, '2027-09-01'))
    const confirmed = rows.filter((r) => r.status === 'confirmed')
    expect(confirmed).toHaveLength(1)
  })

  it('allows exactly one of two simultaneous overlapping POSTs to succeed (run 2, rules out a lucky single pass)', async () => {
    const { responseA, responseB } = await runRaceOnce('11')
    const statuses = [responseA.status, responseB.status].sort()
    expect(statuses).toEqual([201, 409])

    const rows = await testDb
      .select()
      .from(reservations)
      .where(eq(reservations.startDate, '2027-09-11'))
    const confirmed = rows.filter((r) => r.status === 'confirmed')
    expect(confirmed).toHaveLength(1)
  })
})
