import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/auth/identityDb'
import { requirePortalAdmin } from '@/lib/auth/requirePortalAdmin'
import { db } from '@/lib/db/client'
import { logActivity } from '@/lib/db/logActivity'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  const actor = auth.session.user
  const patch: Partial<typeof users.$inferInsert> = {}
  const events: Array<{ eventType: string; metadata: Record<string, unknown> }> = []

  if (body.status !== undefined) {
    if (body.status !== 'approved' && body.status !== 'blocked') {
      return NextResponse.json({ error: 'status must be "approved" or "blocked"' }, { status: 400 })
    }
    patch.status = body.status
    events.push({
      eventType: body.status === 'approved' ? 'user_approved' : 'user_blocked',
      metadata: { targetUserId: id },
    })
  }

  if (body.isReservationsAdmin !== undefined) {
    if (typeof body.isReservationsAdmin !== 'boolean') {
      return NextResponse.json({ error: 'isReservationsAdmin must be a boolean' }, { status: 400 })
    }
    if (!actor.isReservationsAdmin) {
      return NextResponse.json({ error: 'Only a reservations admin can change this' }, { status: 403 })
    }
    patch.isReservationsAdmin = body.isReservationsAdmin
    events.push({
      eventType: body.isReservationsAdmin ? 'reservations_admin_granted' : 'reservations_admin_revoked',
      metadata: { targetUserId: id },
    })
  }

  if (body.isAccountingAdmin !== undefined) {
    if (typeof body.isAccountingAdmin !== 'boolean') {
      return NextResponse.json({ error: 'isAccountingAdmin must be a boolean' }, { status: 400 })
    }
    if (!actor.isAccountingAdmin) {
      return NextResponse.json({ error: 'Only an accounting admin can change this' }, { status: 403 })
    }
    patch.isAccountingAdmin = body.isAccountingAdmin
    events.push({
      eventType: body.isAccountingAdmin ? 'accounting_admin_granted' : 'accounting_admin_revoked',
      metadata: { targetUserId: id },
    })
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [target] = await identityDb.select().from(users).where(eq(users.id, id))
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // users (identity DB) and activity_log (this app's business DB) live in
  // separate databases now, so this can't be one atomic cross-database
  // transaction. The permission change is the authoritative action and is
  // applied first; the log write is best-effort after it succeeds — a rare
  // logging failure must never silently block or roll back a real admin
  // action.
  const [updated] = await identityDb.update(users).set(patch).where(eq(users.id, id)).returning()

  await db.transaction(async (tx) => {
    for (const event of events) {
      await logActivity(tx, { eventType: event.eventType, actorUserId: actor.id, metadata: event.metadata })
    }
  })

  return NextResponse.json({ user: updated })
}
