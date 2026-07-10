export interface ActivityEvent {
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

function str(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : '?'
}

function subjectFor(ownerId: unknown, actorUserId: string | null, users: UserNameMap): string {
  const resolvedOwnerId = typeof ownerId === 'string' ? ownerId : actorUserId
  return resolvedOwnerId === actorUserId ? 'their reservation' : `${nameOf(resolvedOwnerId, users)}'s reservation`
}

export function formatActivityMessage(event: ActivityEvent, users: UserNameMap): string {
  const actor = nameOf(event.actorUserId, users)
  const m = event.metadata

  switch (event.eventType) {
    case 'user_signed_up':
      return `${actor} signed up.`

    case 'user_approved':
      return `${actor} approved ${nameOf(str(m, 'targetUserId'), users)}.`

    case 'user_blocked':
      return `${actor} blocked ${nameOf(str(m, 'targetUserId'), users)}.`

    case 'reservation_created':
      return `${actor} booked ${str(m, 'startDate')} → ${str(m, 'endDate')}.`

    case 'reservation_edited': {
      const subject = subjectFor(m.userId, event.actorUserId, users)
      return `${actor} changed ${subject} from ${str(m, 'previousStartDate')} → ${str(m, 'previousEndDate')} to ${str(m, 'startDate')} → ${str(m, 'endDate')}.`
    }

    case 'reservation_cancelled': {
      const subject = subjectFor(m.userId, event.actorUserId, users)
      return `${actor} cancelled ${subject} for ${str(m, 'startDate')} → ${str(m, 'endDate')}.`
    }

    case 'blocked_date_created': {
      const reason = typeof m.reason === 'string' && m.reason ? ` (${m.reason})` : ''
      return `${actor} blocked off ${str(m, 'startDate')} → ${str(m, 'endDate')}${reason}.`
    }

    case 'blocked_date_removed':
      return `${actor} removed the blocked dates ${str(m, 'startDate')} → ${str(m, 'endDate')}.`

    case 'booking_rules_updated': {
      const after = m.after as Record<string, unknown> | undefined
      if (!after) return `${actor} updated the booking rules.`
      return `${actor} updated the booking rules (horizon: ${String(after.bookingHorizonDate)}, max consecutive nights: ${String(after.maxConsecutiveNights)}, max nights/year: ${String(after.maxNightsPerUserPerYear)}).`
    }

    default:
      return `${actor} performed an action (${event.eventType}).`
  }
}
