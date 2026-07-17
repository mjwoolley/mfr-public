export interface CalendarSelection {
  selectionStart: string | null
  selectionEnd: string | null
}

/**
 * Given the current click-selection state and a newly clicked day, returns
 * the next selection state.
 *
 * - First click: becomes selectionStart; selectionEnd stays unset.
 * - Second click: the CHECK-OUT day. The earlier of the two clicked dates
 *   becomes selectionStart (check-in) and the later becomes selectionEnd
 *   (the exclusive checkout day) directly — this is already the half-open
 *   `[startDate, endDate)` convention used everywhere else (dayInfo.ts,
 *   validateReservation.ts, the API route, the DB). Clicking the SAME day as
 *   the check-in would mean checkout == check-in (0 nights), so the selection
 *   stays in progress instead of completing.
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
    if (clicked === current.selectionStart) {
      // Checkout on the check-in day is a 0-night stay — keep selecting.
      return { selectionStart: clicked, selectionEnd: null }
    }
    const start = current.selectionStart < clicked ? current.selectionStart : clicked
    const checkout = current.selectionStart < clicked ? clicked : current.selectionStart
    return { selectionStart: start, selectionEnd: checkout }
  }
  return { selectionStart: clicked, selectionEnd: null }
}
