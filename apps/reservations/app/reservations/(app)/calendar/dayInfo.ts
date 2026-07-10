import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

export interface DayInfo {
  bookedByName: string | null
  bookedByUserId: string | null
  isBlocked: boolean
  isPastHorizon: boolean
}

export function computeDayInfo(
  date: string,
  reservations: ReservationRow[],
  blockedDates: BlockedDateRow[],
  bookingRules: BookingRulesRow
): DayInfo {
  const booking = reservations.find(
    (r) => r.status === 'confirmed' && date >= r.startDate && date < r.endDate
  )
  const isBlocked = blockedDates.some((b) => date >= b.startDate && date < b.endDate)
  const isPastHorizon = date > bookingRules.bookingHorizonDate

  return {
    bookedByName: booking?.userName ?? null,
    bookedByUserId: booking?.userId ?? null,
    isBlocked,
    isPastHorizon,
  }
}
