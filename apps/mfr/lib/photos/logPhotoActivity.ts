// Appends one activity_log row for a photo-gallery action (upload, delete,
// caption edit, feature toggle). Reuses the shared, generic activity_log table
// the reservations domain already writes to — post-merge everything lives in
// one database, so portalDb can write it directly. Unlike the reservations
// logActivity (which requires a caller-supplied transaction), the photo actions
// aren't transactional, so this inserts on its own and never throws: a missing
// history line must not fail the underlying photo change.

import { portalDb } from '@/lib/portalDb'
import { activityLog } from '@/lib/db/schema'

// The photo event types the history screen understands. Keep in sync with
// formatPhotoEvent in ./formatHistory.
export type PhotoEventType =
  | 'photo_uploaded'
  | 'photo_deleted'
  | 'photo_caption_edited'
  | 'photo_featured'
  | 'photo_unfeatured'

export const PHOTO_EVENT_TYPES: PhotoEventType[] = [
  'photo_uploaded',
  'photo_deleted',
  'photo_caption_edited',
  'photo_featured',
  'photo_unfeatured',
]

export async function logPhotoActivity(params: {
  eventType: PhotoEventType
  actorUserId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await portalDb.insert(activityLog).values({
      eventType: params.eventType,
      actorUserId: params.actorUserId,
      metadata: params.metadata ?? {},
    })
  } catch {
    // History is best-effort; never let a logging failure break the action.
  }
}
