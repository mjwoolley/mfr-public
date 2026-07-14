import { NextRequest, NextResponse } from 'next/server'
import { eq, and, gte, lt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reservations, bookingRules, blockedDates } from '@/lib/db/schema'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/auth/identityDb'
import { validateReservation, type ExistingReservation } from '@/lib/rules/validateReservation'
import { requireApprovedUser } from '@/lib/auth/requireApprovedUser'
import { isOverlapError } from '@/lib/db/isOverlapError'
import { logActivity } from '@/lib/db/logActivity'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json(
      { error: 'Query params "from" and "to" (YYYY-MM-DD) are required' },
      { status: 400 },
    )
  }

  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      status: reservations.status,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.status, 'confirmed'),
        lt(reservations.startDate, to),
        gte(reservations.endDate, from),
      ),
    )

  // users lives in the separate shared identity database now — no SQL-level
  // JOIN is possible across databases, so resolve names with a second query
  // and merge in application code.
  const userIds = [...new Set(rows.map((r) => r.userId))]
  const userRows =
    userIds.length > 0
      ? await identityDb
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : []
  const nameById = new Map(userRows.map((u) => [u.id, u.name]))

  const withNames = rows.map((r) => ({ ...r, userName: nameById.get(r.userId) ?? null }))

  return NextResponse.json({ reservations: withNames })
}

export async function POST(request: NextRequest) {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body.startDate !== 'string' || typeof body.endDate !== 'string') {
    return NextResponse.json(
      { error: 'startDate and endDate (YYYY-MM-DD) are required' },
      { status: 400 },
    )
  }

  const userId = auth.session.user.id
  const { startDate, endDate } = body

  const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))
  if (!rules) {
    return NextResponse.json({ error: 'Booking rules are not configured yet' }, { status: 500 })
  }

  const allConfirmedAndCancelled = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      status: reservations.status,
    })
    .from(reservations)

  const blocked = await db.select().from(blockedDates)

  const validation = validateReservation({
    userId,
    startDate,
    endDate,
    existingReservations: allConfirmedAndCancelled as ExistingReservation[],
    blockedDates: blocked,
    bookingRules: {
      bookingHorizonDate: rules.bookingHorizonDate,
      maxConsecutiveNights: rules.maxConsecutiveNights,
      maxNightsPerUserPerYear: rules.maxNightsPerUserPerYear,
    },
  })

  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason, code: validation.code }, { status: 400 })
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [reservation] = await tx
        .insert(reservations)
        .values({ userId, startDate, endDate, status: 'confirmed' })
        .returning()

      await logActivity(tx, {
        eventType: 'reservation_created',
        actorUserId: userId,
        metadata: { reservationId: reservation.id, startDate, endDate },
      })

      return reservation
    })

    return NextResponse.json({ reservation: created }, { status: 201 })
  } catch (err) {
    if (isOverlapError(err)) {
      return NextResponse.json(
        {
          error:
            'Those dates were just booked or blocked by someone else. Please pick different dates.',
        },
        { status: 409 },
      )
    }
    logger.error({ err, userId, startDate, endDate }, 'failed to create reservation')
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 })
  }
}
