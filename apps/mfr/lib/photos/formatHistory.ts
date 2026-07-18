// Renders raw photo activity_log events into the human sentences shown on the
// Photos history screen. Tolerant by design (mirrors the reservations
// formatMessage): unknown actors become "A former member", missing metadata a
// gentle fallback — old rows must keep rendering as the schema evolves.

export interface PhotoHistoryEvent {
  id: string
  eventType: string
  actorUserId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type UserNameMap = Record<string, string | null>

function nameOf(id: string | null | undefined, users: UserNameMap): string {
  if (!id) return 'Someone'
  const name = users[id]
  return name ?? 'A former member'
}

// A year for the sentence ("a 2026 photo"); omitted quietly when absent.
function yearPhrase(metadata: Record<string, unknown>): string {
  const year = metadata['year']
  return typeof year === 'number' || (typeof year === 'string' && year)
    ? `a ${year} photo`
    : 'a photo'
}

export function formatPhotoEvent(event: PhotoHistoryEvent, users: UserNameMap): string {
  const actor = nameOf(event.actorUserId, users)
  const photo = yearPhrase(event.metadata)

  switch (event.eventType) {
    case 'photo_uploaded':
      return `${actor} added ${photo}.`
    case 'photo_deleted':
      return `${actor} deleted ${photo}.`
    case 'photo_caption_edited': {
      const caption = event.metadata['caption']
      return typeof caption === 'string' && caption.trim()
        ? `${actor} captioned ${photo}: “${caption.trim()}”.`
        : `${actor} edited the caption on ${photo}.`
    }
    case 'photo_featured':
      return `${actor} featured ${photo} on the home page.`
    case 'photo_unfeatured':
      return `${actor} unfeatured ${photo}.`
    default:
      return `${actor} performed an action (${event.eventType}).`
  }
}
