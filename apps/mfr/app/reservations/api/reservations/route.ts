// Reservations collection API. GET: confirmed reservations in a date window,
// with owner names merged in from the identity DB. POST: create — rules
// validation, then insert + activity log in one transaction, with the DB
// overlap constraints as the concurrency backstop (409), then email.

import { NextRequest, NextResponse } from 'next/server'
import { eq, and, gte, lt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reservations, bookingRules, blockedDates } from '@/lib/db/schema'
import { users, canAdminReservations } from '@mfr/auth'
import { identityDb } from '@/lib/reservations/auth/identityDb'
import {
  validateReservation,
  type ExistingReservation,
} from '@/lib/reservations/rules/validateReservation'
import { todayISO } from '@/lib/reservations/rules/dateHelpers'
import { requireApprovedUser } from '@/lib/reservations/auth/requireApprovedUser'
import { isOverlapError } from '@/lib/reservations/isOverlapError'
import { logActivity } from '@/lib/reservations/logActivity'
import { logger } from '@/lib/reservations/logger'
import { sendReservationCreatedEmail } from '@/lib/reservations/notifications'

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

  const actorUserId = auth.session.user.id
  const isReservationsAdmin = canAdminReservations(auth.session.user.roles)
  const { startDate, endDate } = body

  // The reservation owner. Members always book for themselves; a reservations
  // admin may pass a different `userId` to book on a member's behalf. Verify the
  // target exists and is approved so admins can't create rows for unknown or
  // non-member users.
  let userId = actorUserId
  if (typeof body.userId === 'string' && body.userId !== actorUserId) {
    if (!isReservationsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const [target] = await identityDb
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, body.userId))
    if (!target || target.status !== 'approved') {
      return NextResponse.json(
        { error: 'That member could not be found or is not approved.' },
        { status: 400 },
      )
    }
    userId = target.id
  }

  const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))
  if (!rules) {
    return NextResponse.json({ error: 'Booking rules are not configured yet' }, { status: 500 })
  }

  // Deliberately loads ALL reservations, not a window: the yearly-cap check
  // needs the user's full calendar year. Fine at family scale.
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
    isAdmin: isReservationsAdmin,
    today: todayISO(),
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
        actorUserId,
        metadata: {
          reservationId: reservation.id,
          startDate,
          endDate,
          // Present only when an admin booked on a member's behalf.
          ...(userId !== actorUserId ? { userId } : {}),
        },
      })

      return reservation
    })

    // After the transaction commits so no email fires on rollback; awaited
    // because Vercel may freeze the function once the response returns.
    // Never throws — failures are logged inside.
    await sendReservationCreatedEmail({
      reservationId: created.id,
      ownerUserId: userId,
      startDate,
      endDate,
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
