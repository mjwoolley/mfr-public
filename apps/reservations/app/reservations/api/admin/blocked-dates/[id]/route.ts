import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { blockedDates } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { logActivity } from '@/lib/db/logActivity'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const [existing] = await db.select().from(blockedDates).where(eq(blockedDates.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.transaction(async (tx) => {
    await tx.delete(blockedDates).where(eq(blockedDates.id, id))

    await logActivity(tx, {
      eventType: 'blocked_date_removed',
      actorUserId: auth.session.user.id,
      metadata: {
        blockedDateId: id,
        startDate: existing.startDate,
        endDate: existing.endDate,
        reason: existing.reason,
      },
    })
  })

  return NextResponse.json({ ok: true })
}
