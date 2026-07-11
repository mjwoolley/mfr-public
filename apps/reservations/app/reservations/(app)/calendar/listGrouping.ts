import type { ReservationRow } from './useCalendarData'

/**
 * The List view shows the confirmed reservations that check in during the
 * displayed month, soonest first — the pure counterpart of the prototype's
 * `inMonthRes` computation.
 */
export function reservationsStartingInMonth(
  reservations: ReservationRow[],
  year: number,
  month: number // 0-11
): ReservationRow[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  return reservations
    .filter((r) => r.status === 'confirmed' && r.startDate.startsWith(prefix))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
}
