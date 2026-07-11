import { nightsBetween } from '@/lib/rules/dateHelpers'

export interface SummaryReservation {
  id: string
  userId: string
  userName: string | null
  startDate: string
  endDate: string
  status: 'confirmed' | 'cancelled'
}

export interface UserSummaryGroup {
  userId: string
  userName: string
  upcoming: SummaryReservation[]
  past: SummaryReservation[]
  upcomingNights: number
  pastNights: number
  totalNights: number
}

/**
 * Groups reservations by user for the Reservation Summary page, splitting
 * each user's reservations into upcoming/past sections and computing
 * per-person night subtotals.
 *
 * - Cancelled reservations are excluded. The API route also filters these
 *   out server-side (the preferred layer, per the Phase 9 plan); this is a
 *   defensive second layer so the function stays correct even if it is ever
 *   fed unfiltered data, and so the exclusion is independently unit-testable.
 * - past = `endDate <= today` (the stay is fully checked out); upcoming =
 *   everything else, including an in-progress stay where today falls inside
 *   `[startDate, endDate)`.
 *
 * `today` is an explicit parameter (rather than read internally from
 * `Date.now()`) so this function stays pure and deterministic for testing.
 */
export function groupByUser(reservationsList: SummaryReservation[], today: string): UserSummaryGroup[] {
  const groups = new Map<string, UserSummaryGroup>()

  for (const r of reservationsList) {
    if (r.status === 'cancelled') continue

    if (!groups.has(r.userId)) {
      groups.set(r.userId, {
        userId: r.userId,
        userName: r.userName ?? 'Unknown user',
        upcoming: [],
        past: [],
        upcomingNights: 0,
        pastNights: 0,
        totalNights: 0,
      })
    }
    const group = groups.get(r.userId)!
    const nights = nightsBetween(r.startDate, r.endDate)

    if (r.endDate <= today) {
      group.past.push(r)
      group.pastNights += nights
    } else {
      group.upcoming.push(r)
      group.upcomingNights += nights
    }
    group.totalNights += nights
  }

  for (const group of groups.values()) {
    group.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate))
    group.past.sort((a, b) => b.startDate.localeCompare(a.startDate))
  }

  return [...groups.values()].sort((a, b) => a.userName.localeCompare(b.userName))
}
