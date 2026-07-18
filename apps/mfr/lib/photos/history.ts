// Read helper for the Photos history screen: the newest photo activity_log
// events plus the actor-id→name map to render them. Reuses the shared
// activity_log table (see logPhotoActivity) filtered to the photo event types.
// Names come from the identity users table, joined in JS by id string — same
// pattern as getContributors in ./gallery and the reservations activity route.

import { desc, inArray } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { portalDb } from '@/lib/portalDb'
import { identityDb } from '@/lib/identityDb'
import { activityLog } from '@/lib/db/schema'
import { PHOTO_EVENT_TYPES } from './logPhotoActivity'
import type { PhotoHistoryEvent, UserNameMap } from './formatHistory'

const HISTORY_LIMIT = 100

export async function getPhotoHistory(): Promise<{
  events: PhotoHistoryEvent[]
  users: UserNameMap
}> {
  const rows = await portalDb
    .select({
      id: activityLog.id,
      eventType: activityLog.eventType,
      actorUserId: activityLog.actorUserId,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(inArray(activityLog.eventType, PHOTO_EVENT_TYPES))
    .orderBy(desc(activityLog.createdAt))
    .limit(HISTORY_LIMIT)

  const events: PhotoHistoryEvent[] = rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    actorUserId: r.actorUserId,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }))

  const names: UserNameMap = {}
  if (events.length > 0) {
    const idRows = await identityDb.select({ id: users.id, name: users.name }).from(users)
    for (const u of idRows) names[u.id] = u.name
  }

  return { events, users: names }
}
