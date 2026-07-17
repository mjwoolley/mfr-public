// Admin booking-rules API: read and partial-PATCH of the singleton row
// (id=1), logging before→after values to the activity feed. PATCH also
// handles first-time creation on a fresh environment.

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { bookingRules } from '@/lib/db/schema'
import { requireReservationsAdmin } from '@/lib/reservations/auth/requireReservationsAdmin'
import { logActivity } from '@/lib/reservations/logActivity'

export async function GET() {
  const auth = await requireReservationsAdmin()
  if (!auth.ok) return auth.response

  const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))
  return NextResponse.json({ bookingRules: rules ?? null })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireReservationsAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  const [before] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))

  const patch: Partial<typeof bookingRules.$inferInsert> = {}
  if (typeof body.bookingHorizonDate === 'string')
    patch.bookingHorizonDate = body.bookingHorizonDate
  if (typeof body.maxConsecutiveNights === 'number')
    patch.maxConsecutiveNights = body.maxConsecutiveNights
  if (typeof body.maxNightsPerUserPerYear === 'number')
    patch.maxNightsPerUserPerYear = body.maxNightsPerUserPerYear

  // Bootstrap path: no rules row exists yet (fresh environment). A partial
  // patch can't create a complete row, so require all three fields.
  if (
    !before &&
    !(
      typeof patch.bookingHorizonDate === 'string' &&
      typeof patch.maxConsecutiveNights === 'number' &&
      typeof patch.maxNightsPerUserPerYear === 'number'
    )
  ) {
    return NextResponse.json(
      {
        error:
          'No booking rules exist yet — horizon date and both night limits are all required to create them',
      },
      { status: 400 },
    )
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = before
      ? await tx
          .update(bookingRules)
          .set({ ...patch, updatedAt: new Date(), updatedBy: auth.session.user.id })
          .where(eq(bookingRules.id, 1))
          .returning()
      : await tx
          .insert(bookingRules)
          .values({
            id: 1,
            bookingHorizonDate: patch.bookingHorizonDate!,
            maxConsecutiveNights: patch.maxConsecutiveNights!,
            maxNightsPerUserPerYear: patch.maxNightsPerUserPerYear!,
            updatedBy: auth.session.user.id,
          })
          .returning()

    await logActivity(tx, {
      eventType: 'booking_rules_updated',
      actorUserId: auth.session.user.id,
      metadata: { before: before ?? null, after: row },
    })

    return row
  })

  return NextResponse.json({ bookingRules: updated })
}
