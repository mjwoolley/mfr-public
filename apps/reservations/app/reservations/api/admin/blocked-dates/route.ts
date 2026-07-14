import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { blockedDates } from '@/lib/db/schema'
import { requireReservationsAdmin } from '@/lib/auth/requireReservationsAdmin'
import { isOverlapError } from '@/lib/db/isOverlapError'
import { logActivity } from '@/lib/db/logActivity'
import { logger } from '@/lib/logger'

export async function GET() {
  const auth = await requireReservationsAdmin()
  if (!auth.ok) return auth.response

  const rows = await db.select().from(blockedDates)
  return NextResponse.json({ blockedDates: rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireReservationsAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body.startDate !== 'string' || typeof body.endDate !== 'string') {
    return NextResponse.json(
      { error: 'startDate and endDate (YYYY-MM-DD) are required' },
      { status: 400 },
    )
  }
  if (body.endDate <= body.startDate) {
    return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 })
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(blockedDates)
        .values({
          startDate: body.startDate,
          endDate: body.endDate,
          reason: typeof body.reason === 'string' ? body.reason : null,
          createdBy: auth.session.user.id,
        })
        .returning()

      await logActivity(tx, {
        eventType: 'blocked_date_created',
        actorUserId: auth.session.user.id,
        metadata: { blockedDateId: row.id, startDate: body.startDate, endDate: body.endDate },
      })

      return row
    })

    return NextResponse.json({ blockedDate: created }, { status: 201 })
  } catch (err) {
    if (isOverlapError(err)) {
      return NextResponse.json(
        { error: 'Those dates overlap an existing reservation.' },
        { status: 409 },
      )
    }
    logger.error({ err, body }, 'failed to create blocked date')
    return NextResponse.json({ error: 'Failed to create blocked date' }, { status: 500 })
  }
}
