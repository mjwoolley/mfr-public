// Per-day cell state for the month grid. Storage stays half-open
// [startDate, endDate), but for DISPLAY the calendar shades through the
// checkout day, so a day can belong to two stays at once: the one occupying
// it as a booked NIGHT (start <= date < end) and the one CHECKING OUT on it
// (end === date). On a turnover day both are set — different reservations —
// and the cell renders a split color. The night slot stays the "primary"
// (drives click routing / disabled), so a checkout-only day is still
// selectable for a new check-in.

import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

export interface DayInfo {
  /** The stay occupying this day as a booked NIGHT (start <= date < end), if any. */
  reservationId: string | null
  bookedByName: string | null
  bookedByUserId: string | null
  /** True on the reservation's check-in day — where the calendar shows the name. */
  isReservationStart: boolean
  /** The stay CHECKING OUT on this day (endDate === date), if any. Distinct
   *  from the night slot; both set together only on a turnover day. */
  checkoutReservationId: string | null
  checkoutByName: string | null
  checkoutByUserId: string | null
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
  // The half-open night match above excludes the checkout day, so this find
  // never returns the same reservation as `booking` for the same day.
  const checkout = reservations.find((r) => r.status === 'confirmed' && r.endDate === date)
  const isBlocked = blockedDates.some((b) => date >= b.startDate && date < b.endDate)
  const isPastHorizon = date > bookingRules.bookingHorizonDate

  return {
    reservationId: booking?.id ?? null,
    bookedByName: booking?.userName ?? null,
    bookedByUserId: booking?.userId ?? null,
    isReservationStart: booking ? date === booking.startDate : false,
    checkoutReservationId: checkout?.id ?? null,
    checkoutByName: checkout?.userName ?? null,
    checkoutByUserId: checkout?.userId ?? null,
    isBlocked,
    isPastHorizon,
  }
}
