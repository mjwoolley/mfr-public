/**
 * Determines whether a given calendar day should be highlighted as part of
 * the user's in-progress or completed date selection.
 *
 * Two distinct cases:
 *
 * - Completed selection (`selectionEnd` is set): `selectionEnd` is an
 *   exclusive checkout date (see calendarSelection.ts), so the highlighted
 *   range is the half-open `[selectionStart, selectionEnd)` — the checkout
 *   day itself is NOT part of the stay and must not be highlighted.
 *   `selectionStart` is always <= `selectionEnd` by construction, so no
 *   swapping is needed here.
 *
 * - In-progress hover preview (only `selectionStart` is set, no
 *   `selectionEnd` yet): `hoverDate` is the literal day the user is
 *   currently pointing at as a candidate last night, so the preview range
 *   is inclusive of `hoverDate` on both ends — this is unchanged legacy
 *   behavior.
 */
export function isDayInSelection(
  date: string,
  selectionStart: string | null,
  selectionEnd: string | null,
  hoverDate: string | null
): boolean {
  if (!selectionStart) {
    return false
  }

  if (selectionEnd) {
    return date >= selectionStart && date < selectionEnd
  }

  if (hoverDate) {
    const lo = selectionStart < hoverDate ? selectionStart : hoverDate
    const hi = selectionStart < hoverDate ? hoverDate : selectionStart
    return date >= lo && date <= hi
  }

  return false
}
