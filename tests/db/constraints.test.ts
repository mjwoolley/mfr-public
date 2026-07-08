import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../../lib/db/client'
import { users, reservations, blockedDates, bookingRules } from '../../lib/db/schema'
import { eq } from 'drizzle-orm'

const createdUserIds: string[] = []

afterEach(async () => {
  // Deleting the user cascades to reservations/blockedDates(created_by) via
  // the FK, except blockedDates.created_by has no ON DELETE CASCADE, so
  // clean up explicitly in dependency order.
  for (const userId of createdUserIds) {
    await db.delete(reservations).where(eq(reservations.userId, userId))
    await db.delete(blockedDates).where(eq(blockedDates.createdBy, userId))
    await db.delete(users).where(eq(users.id, userId))
  }
  createdUserIds.length = 0
})

async function makeTestUser(emailSuffix: string) {
  const [user] = await db
    .insert(users)
    .values({ email: `constraint-test-${emailSuffix}-${Date.now()}@example.com`, status: 'approved' })
    .returning()
  createdUserIds.push(user.id)
  return user
}

describe('database overlap constraints', () => {
  it('rejects a second confirmed reservation overlapping an existing confirmed reservation', async () => {
    const user = await makeTestUser('a')

    await db.insert(reservations).values({
      userId: user.id,
      startDate: '2027-07-01',
      endDate: '2027-07-05',
      status: 'confirmed',
    })

    // drizzle-orm's postgres-js adapter wraps the driver's PostgresError in a
    // DrizzleQueryError; the Postgres error code lives on `.cause`.
    await expect(
      db.insert(reservations).values({
        userId: user.id,
        startDate: '2027-07-03',
        endDate: '2027-07-08',
        status: 'confirmed',
      })
    ).rejects.toMatchObject({ cause: { code: '23P01' } })
  })

  it('allows same-day turnover (one reservation ending the day another starts)', async () => {
    const user = await makeTestUser('b')

    await db.insert(reservations).values({
      userId: user.id,
      startDate: '2027-08-01',
      endDate: '2027-08-05',
      status: 'confirmed',
    })

    await expect(
      db.insert(reservations).values({
        userId: user.id,
        startDate: '2027-08-05',
        endDate: '2027-08-08',
        status: 'confirmed',
      })
    ).resolves.toBeDefined()
  })

  it('does not block on a cancelled reservation covering the same dates', async () => {
    const user = await makeTestUser('c')

    await db.insert(reservations).values({
      userId: user.id,
      startDate: '2027-09-01',
      endDate: '2027-09-05',
      status: 'cancelled',
    })

    await expect(
      db.insert(reservations).values({
        userId: user.id,
        startDate: '2027-09-01',
        endDate: '2027-09-05',
        status: 'confirmed',
      })
    ).resolves.toBeDefined()
  })

  it('rejects a confirmed reservation overlapping a blocked date range', async () => {
    const user = await makeTestUser('d')

    await db.insert(blockedDates).values({
      startDate: '2027-10-01',
      endDate: '2027-10-10',
      reason: 'maintenance',
      createdBy: user.id,
    })

    // The trigger's RAISE EXCEPTION message ends up on the wrapped error's
    // `.cause.message`, not the top-level DrizzleQueryError message.
    await expect(
      db.insert(reservations).values({
        userId: user.id,
        startDate: '2027-10-05',
        endDate: '2027-10-06',
        status: 'confirmed',
      })
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/reservation_overlaps_blocked_date/) } })
  })

  it('rejects a blocked date range overlapping an existing confirmed reservation', async () => {
    const user = await makeTestUser('e')

    await db.insert(reservations).values({
      userId: user.id,
      startDate: '2027-11-01',
      endDate: '2027-11-05',
      status: 'confirmed',
    })

    await expect(
      db.insert(blockedDates).values({
        startDate: '2027-11-03',
        endDate: '2027-11-04',
        reason: 'maintenance',
        createdBy: user.id,
      })
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/blocked_date_overlaps_reservation/) } })
  })

  it('enforces booking_rules as a singleton (id must be 1)', async () => {
    await expect(
      db.insert(bookingRules).values({
        id: 2,
        bookingHorizonDate: '2027-12-31',
        maxConsecutiveNights: 7,
        maxNightsPerUserPerYear: 14,
      })
    ).rejects.toThrow()
  })
})
