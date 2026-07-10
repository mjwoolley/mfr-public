import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { bookingRules } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { logActivity } from '@/lib/db/logActivity'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))
  return NextResponse.json({ bookingRules: rules ?? null })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  const [before] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))

  const patch: Partial<typeof bookingRules.$inferInsert> = {}
  if (typeof body.bookingHorizonDate === 'string') patch.bookingHorizonDate = body.bookingHorizonDate
  if (typeof body.maxConsecutiveNights === 'number') patch.maxConsecutiveNights = body.maxConsecutiveNights
  if (typeof body.maxNightsPerUserPerYear === 'number') patch.maxNightsPerUserPerYear = body.maxNightsPerUserPerYear

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(bookingRules)
      .set({ ...patch, updatedAt: new Date(), updatedBy: auth.session.user.id })
      .where(eq(bookingRules.id, 1))
      .returning()

    await logActivity(tx, {
      eventType: 'booking_rules_updated',
      actorUserId: auth.session.user.id,
      metadata: { before, after: row },
    })

    return row
  })

  return NextResponse.json({ bookingRules: updated })
}
