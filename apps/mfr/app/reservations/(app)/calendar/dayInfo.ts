// Per-day cell state for the month grid: which reservation (if any) covers
// the day, blocked status, and past-horizon status. Half-open comparisons —
// a checkout day is free for the next stay.

import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

export interface DayInfo {
  reservationId: string | null
  bookedByName: string | null
  bookedByUserId: string | null
  /** True on the reservation's check-in day — where the calendar shows the name. */
  isReservationStart: boolean
  isBlocked: boolean
  isPastHorizon: boolean
}

export function computeDayInfo(
  date: string,
  reservations: ReservationRow[],
  blockedDates: BlockedDateRow[],
  bookingRules: BookingRulesRow,
): DayInfo {
  const booking = reservations.find(
    (r) => r.status === 'confirmed' && date >= r.startDate && date < r.endDate,
  )
  const isBlocked = blockedDates.some((b) => date >= b.startDate && date < b.endDate)
  const isPastHorizon = date > bookingRules.bookingHorizonDate

  return {
    reservationId: booking?.id ?? null,
    bookedByName: booking?.userName ?? null,
    bookedByUserId: booking?.userId ?? null,
    isReservationStart: booking ? date === booking.startDate : false,
    isBlocked,
    isPastHorizon,
  }
}
