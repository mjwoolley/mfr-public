// Single-reservation API: PATCH (change dates) and DELETE (cancel), allowed
// for the owner or a reservations admin acting on their behalf. Edits re-run
// the full rules validation excluding the reservation itself; cancels are
// idempotent. Both log activity and email the owner (cc admins).

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { canAdminReservations } from '@mfr/auth'
import { db } from '@/lib/db/client'
import { reservations, bookingRules, blockedDates } from '@/lib/db/schema'
import { validateReservation, type ExistingReservation } from '@/lib/rules/validateReservation'
import { requireApprovedUser } from '@/lib/auth/requireApprovedUser'
import { isOverlapError } from '@/lib/db/isOverlapError'
import { logActivity } from '@/lib/db/logActivity'
import { logger } from '@/lib/logger'
import { sendReservationCancelledEmail, sendReservationUpdatedEmail } from '@/lib/notifications'

// Fetch + authorize in one step: admins may act on any reservation, members
// only on their own. Callers distinguish 404 (no row) from 403 (not allowed).
async function loadOwnedReservation(id: string, userId: string, isReservationsAdmin: boolean) {
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id))
  if (!reservation) return { reservation: null, allowed: false }
  const allowed = isReservationsAdmin || reservation.userId === userId
  return { reservation, allowed }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { reservation, allowed } = await loadOwnedReservation(
    id,
    auth.session.user.id,
    canAdminReservations(auth.session.user.roles),
  )
  if (!reservation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.startDate !== 'string' || typeof body.endDate !== 'string') {
    return NextResponse.json(
      { error: 'startDate and endDate (YYYY-MM-DD) are required' },
      { status: 400 },
    )
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

    // After the transaction commits so no email fires on rollback; skipped
    // when nothing actually changed. Awaited (Vercel may freeze the function
    // after the response); never throws — failures are logged inside.
    const datesChanged = startDate !== reservation.startDate || endDate !== reservation.endDate
    if (datesChanged) {
      await sendReservationUpdatedEmail({
        reservationId: id,
        ownerUserId: reservation.userId,
        actorUserId: auth.session.user.id,
        startDate,
        endDate,
        previousStartDate: reservation.startDate,
        previousEndDate: reservation.endDate,
      })
    }

    return NextResponse.json({ reservation: updated })
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
    logger.error({ err, id, startDate, endDate }, 'failed to edit reservation')
    return NextResponse.json({ error: 'Failed to edit reservation' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { reservation, allowed } = await loadOwnedReservation(
    id,
    auth.session.user.id,
    canAdminReservations(auth.session.user.roles),
  )
  if (!reservation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Idempotent: cancelling an already-cancelled reservation is a no-op and
  // must not re-send the cancellation email.
  if (reservation.status === 'cancelled') {
    return NextResponse.json({ reservation })
  }

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

  // After the transaction commits; awaited (Vercel may freeze the function
  // after the response); never throws — failures are logged inside.
  await sendReservationCancelledEmail({
    reservationId: id,
    ownerUserId: reservation.userId,
    actorUserId: auth.session.user.id,
    startDate: reservation.startDate,
    endDate: reservation.endDate,
  })

  return NextResponse.json({ reservation: cancelled })
}
