import { addDays } from '@/lib/reservations/rules/dateHelpers'

export interface CalendarSelection {
  selectionStart: string | null
  selectionEnd: string | null
}

/**
 * Given the current click-selection state and a newly clicked day, returns
 * the next selection state.
 *
 * - First click: becomes selectionStart; selectionEnd stays unset.
 * - Second click: the earlier of the two clicked dates becomes
 *   selectionStart, and the later — the last night the user wants to stay —
 *   is converted to an exclusive checkout date (+1 day) before becoming
 *   selectionEnd. This keeps selectionEnd consistent with the half-open
 *   `[startDate, endDate)` convention used everywhere else (dayInfo.ts,
 *   validateReservation.ts, the API route, the DB).
 * - Third click (a selection is already complete): starts a new selection.
 */
export function computeSelectionAfterClick(
  current: CalendarSelection,
  clicked: string,
): CalendarSelection {
  if (!current.selectionStart) {
    return { selectionStart: clicked, selectionEnd: null }
  }
  if (!current.selectionEnd) {
    const lastNight = current.selectionStart < clicked ? clicked : current.selectionStart
    const start = current.selectionStart < clicked ? current.selectionStart : clicked
    return { selectionStart: start, selectionEnd: addDays(lastNight, 1) }
  }
  return { selectionStart: clicked, selectionEnd: null }
}
