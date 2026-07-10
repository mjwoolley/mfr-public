import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reservations, bookingRules, blockedDates } from '@/lib/db/schema'
import { validateReservation, type ExistingReservation } from '@/lib/rules/validateReservation'
import { requireApprovedUser } from '@/lib/auth/requireApprovedUser'
import { isOverlapError } from '@/lib/db/isOverlapError'
import { logActivity } from '@/lib/db/logActivity'
import { logger } from '@/lib/logger'

async function loadOwnedReservation(id: string, userId: string, isAdmin: boolean) {
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) return { reservation: null, allowed: false }
  const allowed = isAdmin || reservation.userId === userId
  return { reservation, allowed }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { reservation, allowed } = await loadOwnedReservation(id, auth.session.user.id, auth.session.user.isAdmin)
  if (!reservation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.startDate !== 'string' || typeof body.endDate !== 'string') {
    return NextResponse.json({ error: 'startDate and endDate (YYYY-MM-DD) are required' }, { status: 400 })
  }
  const { startDate, endDate } = body

  const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))
  if (!rules) {
    return NextResponse.json({ error: 'Booking rules are not configured yet' }, { status: 500 })
  }

  const allReservations = await db
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
    userId: reservation.userId,
    startDate,
    endDate,
    excludeReservationId: reservation.id,
    existingReservations: allReservations as ExistingReservation[],
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
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(reservations)
        .set({ startDate, endDate })
        .where(eq(reservations.id, id))
        .returning()

      await logActivity(tx, {
        eventType: 'reservation_edited',
        actorUserId: auth.session.user.id,
        metadata: {
          reservationId: id,
          userId: reservation.userId,
          startDate,
          endDate,
          previousStartDate: reservation.startDate,
          previousEndDate: reservation.endDate,
        },
      })

      return row
    })

    return NextResponse.json({ reservation: updated })
  } catch (err) {
    if (isOverlapError(err)) {
      return NextResponse.json(
        { error: 'Those dates were just booked or blocked by someone else. Please pick different dates.' },
        { status: 409 }
      )
    }
    logger.error({ err, id, startDate, endDate }, 'failed to edit reservation')
    return NextResponse.json({ error: 'Failed to edit reservation' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { reservation, allowed } = await loadOwnedReservation(id, auth.session.user.id, auth.session.user.isAdmin)
  if (!reservation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cancelled = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(reservations)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(reservations.id, id))
      .returning()

    await logActivity(tx, {
      eventType: 'reservation_cancelled',
      actorUserId: auth.session.user.id,
      metadata: {
        reservationId: id,
        userId: reservation.userId,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
      },
    })

    return row
  })

  return NextResponse.json({ reservation: cancelled })
}
