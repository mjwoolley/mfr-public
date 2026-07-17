/**
 * Determines whether a given calendar day should be highlighted as part of
 * the user's in-progress or completed date selection.
 *
 * The highlight is INCLUSIVE of both endpoints: the check-in date AND the
 * check-out date are highlighted (e.g. check-in Jul 21, check-out Jul 23
 * highlights 21, 22 and 23). This is display only — storage stays half-open
 * with `selectionEnd` as the exclusive checkout day, and the stay is still
 * `nights = selectionEnd − selectionStart`.
 *
 * Two distinct cases:
 *
 * - Completed selection (`selectionEnd` is set): highlight the closed range
 *   `[selectionStart, selectionEnd]`. `selectionStart` is always <=
 *   `selectionEnd` by construction, so no swapping is needed here.
 *
 * - In-progress hover preview (only `selectionStart` is set, no
 *   `selectionEnd` yet): `hoverDate` is the candidate CHECK-OUT day, and the
 *   preview highlights the closed range between the check-in date and the
 *   hovered check-out day (inclusive of both), regardless of hover direction.
 */
export function isDayInSelection(
  date: string,
  selectionStart: string | null,
  selectionEnd: string | null,
  hoverDate: string | null,
): boolean {
  if (!selectionStart) {
    return false
  }

  if (selectionEnd) {
    return date >= selectionStart && date <= selectionEnd
  }

  if (hoverDate) {
    const lo = selectionStart < hoverDate ? selectionStart : hoverDate
    const hi = selectionStart < hoverDate ? hoverDate : selectionStart
    return date >= lo && date <= hi
  }

  return false
}
