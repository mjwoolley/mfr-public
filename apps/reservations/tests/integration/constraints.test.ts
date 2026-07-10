import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { db } from '../../lib/db/client'
import { reservations, blockedDates, bookingRules } from '../../lib/db/schema'
import { eq } from 'drizzle-orm'

// reservations.userId and blockedDates.createdBy are plain, unconstrained
// uuid columns now (users lives in the separate shared identity database —
// no cross-database FK is possible), so these tests, which exist purely to
// verify the business-DB-level overlap constraints/triggers, no longer need
// a real user row at all — a random UUID satisfies the column just as well.
const createdReservationUserIds: string[] = []

afterEach(async () => {
  for (const userId of createdReservationUserIds) {
    await db.delete(reservations).where(eq(reservations.userId, userId))
    await db.delete(blockedDates).where(eq(blockedDates.createdBy, userId))
  }
  createdReservationUserIds.length = 0
})

function fakeUserId(): string {
  const id = randomUUID()
  createdReservationUserIds.push(id)
  return id
}

describe('database overlap constraints', () => {
  it('rejects a second confirmed reservation overlapping an existing confirmed reservation', async () => {
    const userId = fakeUserId()

    await db.insert(reservations).values({
      userId,
      startDate: '2030-07-01',
      endDate: '2030-07-05',
      status: 'confirmed',
    })

    // drizzle-orm's postgres-js adapter wraps the driver's PostgresError in a
    // DrizzleQueryError; the Postgres error code lives on `.cause`.
    await expect(
      db.insert(reservations).values({
        userId,
        startDate: '2030-07-03',
        endDate: '2030-07-08',
        status: 'confirmed',
      })
    ).rejects.toMatchObject({ cause: { code: '23P01' } })
  })

  it('allows same-day turnover (one reservation ending the day another starts)', async () => {
    const userId = fakeUserId()

    await db.insert(reservations).values({
      userId,
      startDate: '2030-08-01',
      endDate: '2030-08-05',
      status: 'confirmed',
    })

    await expect(
      db.insert(reservations).values({
        userId,
        startDate: '2030-08-05',
        endDate: '2030-08-08',
        status: 'confirmed',
      })
    ).resolves.toBeDefined()
  })

  it('does not block on a cancelled reservation covering the same dates', async () => {
    const userId = fakeUserId()

    await db.insert(reservations).values({
      userId,
      startDate: '2030-09-01',
      endDate: '2030-09-05',
      status: 'cancelled',
    })

    await expect(
      db.insert(reservations).values({
        userId,
        startDate: '2030-09-01',
        endDate: '2030-09-05',
        status: 'confirmed',
      })
    ).resolves.toBeDefined()
  })

  it('rejects a confirmed reservation overlapping a blocked date range', async () => {
    const userId = fakeUserId()

    await db.insert(blockedDates).values({
      startDate: '2030-10-01',
      endDate: '2030-10-10',
      reason: 'maintenance',
      createdBy: userId,
    })

    // The trigger's RAISE EXCEPTION message ends up on the wrapped error's
    // `.cause.message`, not the top-level DrizzleQueryError message.
    await expect(
      db.insert(reservations).values({
        userId,
        startDate: '2030-10-05',
        endDate: '2030-10-06',
        status: 'confirmed',
      })
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/reservation_overlaps_blocked_date/) } })
  })

  it('rejects a blocked date range overlapping an existing confirmed reservation', async () => {
    const userId = fakeUserId()

    await db.insert(reservations).values({
      userId,
      startDate: '2030-11-01',
      endDate: '2030-11-05',
      status: 'confirmed',
    })

    await expect(
      db.insert(blockedDates).values({
        startDate: '2030-11-03',
        endDate: '2030-11-04',
        reason: 'maintenance',
        createdBy: userId,
      })
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/blocked_date_overlaps_reservation/) } })
  })

  it('enforces booking_rules as a singleton (id must be 1)', async () => {
    await expect(
      db.insert(bookingRules).values({
        id: 2,
        bookingHorizonDate: '2030-12-31',
        maxConsecutiveNights: 7,
        maxNightsPerUserPerYear: 14,
      })
    ).rejects.toThrow()
  })
})
