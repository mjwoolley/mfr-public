// Site-wide activity-feed API for the admin Activity tab: newest-first pages
// of activity_log rows, cursor-paginated via `?before=<ISO timestamp>`
// (nextCursor in the response). Ships the full user-id→name map alongside so
// the client can render any event.
//
// Two kinds of rows are filtered out: photo events (they have their own
// history on Photos → History) and anything by the automated smoke-test user.

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, isNull, lt, ne, notInArray, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activityLog } from '@/lib/db/schema'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/reservations/auth/identityDb'
import { requireContentAdminApi } from '@/lib/portal/requireContentAdminApi'
import { PHOTO_EVENT_TYPES } from '@/lib/photos/logPhotoActivity'
import { SMOKE_TEST_USER_ID } from '@/lib/smokeTestUser'

const PAGE_SIZE = 30

// Applied to every page. The isNull arm matters: actorUserId is nullable
// (system rows), and a bare `ne` against NULL would silently drop them.
const feedFilter = and(
  notInArray(activityLog.eventType, PHOTO_EVENT_TYPES),
  or(isNull(activityLog.actorUserId), ne(activityLog.actorUserId, SMOKE_TEST_USER_ID)),
)

export async function GET(request: NextRequest) {
  const auth = await requireContentAdminApi()
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

  const rows = await db
    .select(selection)
    .from(activityLog)
    .where(before ? and(feedFilter, lt(activityLog.createdAt, new Date(before))) : feedFilter)
    .orderBy(desc(activityLog.createdAt))
    .limit(PAGE_SIZE)

  const allUsers = await identityDb.select({ id: users.id, name: users.name }).from(users)
  const userNames: Record<string, string | null> = {}
  for (const u of allUsers) userNames[u.id] = u.name

  const nextCursor =
    rows.length === PAGE_SIZE ? rows[rows.length - 1].createdAt.toISOString() : null

  return NextResponse.json({ events: rows, users: userNames, nextCursor })
}
