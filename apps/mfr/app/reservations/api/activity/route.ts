// Activity-feed API: newest-first pages of activity_log rows, cursor-
// paginated via `?before=<ISO timestamp>` (nextCursor in the response). Ships
// the full user-id→name map alongside so the client can render any event.

import { NextRequest, NextResponse } from 'next/server'
import { desc, lt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activityLog } from '@/lib/db/schema'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/reservations/auth/identityDb'
import { requireApprovedUser } from '@/lib/reservations/auth/requireApprovedUser'

const PAGE_SIZE = 30

export async function GET(request: NextRequest) {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const before = searchParams.get('before')

  const selection = {
    id: activityLog.id,
    eventType: activityLog.eventType,
    actorUserId: activityLog.actorUserId,
    metadata: activityLog.metadata,
    createdAt: activityLog.createdAt,
  }

  const rows = before
    ? await db
        .select(selection)
        .from(activityLog)
        .where(lt(activityLog.createdAt, new Date(before)))
        .orderBy(desc(activityLog.createdAt))
        .limit(PAGE_SIZE)
    : await db
        .select(selection)
        .from(activityLog)
        .orderBy(desc(activityLog.createdAt))
        .limit(PAGE_SIZE)

  const allUsers = await identityDb.select({ id: users.id, name: users.name }).from(users)
  const userNames: Record<string, string | null> = {}
  for (const u of allUsers) userNames[u.id] = u.name

  const nextCursor =
    rows.length === PAGE_SIZE ? rows[rows.length - 1].createdAt.toISOString() : null

  return NextResponse.json({ events: rows, users: userNames, nextCursor })
}
