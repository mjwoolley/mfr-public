import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { logActivity } from '@/lib/db/logActivity'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || (body.status !== 'approved' && body.status !== 'blocked')) {
    return NextResponse.json({ error: 'status must be "approved" or "blocked"' }, { status: 400 })
  }

  const [target] = await db.select().from(users).where(eq(users.id, id))
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(users).set({ status: body.status }).where(eq(users.id, id)).returning()

    await logActivity(tx, {
      eventType: body.status === 'approved' ? 'user_approved' : 'user_blocked',
      actorUserId: auth.session.user.id,
      metadata: { targetUserId: id },
    })

    return row
  })

  return NextResponse.json({ user: updated })
}
