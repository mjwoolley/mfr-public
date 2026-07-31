/**
 * Parsing the optional date on a share transaction.
 *
 * `Transaction` has no separate business-date column — `createdAt` IS the
 * transaction date, and every fiscal-year figure in the app buckets on it. So
 * back-dating means writing the entered date into `createdAt`, and this module
 * is the one place that decides what a form value turns into.
 *
 * Two decisions worth knowing:
 *
 * - **Today (or blank) means "don't set it".** The caller then omits
 *   `createdAt` entirely and Postgres's `CURRENT_TIMESTAMP` default applies, so
 *   the common path behaves exactly as it did before this feature — including
 *   keeping same-day transactions distinguishable, which a fixed noon stamp
 *   would destroy (the history list orders by `createdAt` descending).
 * - **A past date is stored at noon UTC, not midnight.** Noon renders as the
 *   typed day everywhere from UTC-12 to UTC+11, and `fiscalYear()` reads
 *   `getUTCMonth`, so the date lands in the fiscal year the admin saw. Midnight
 *   UTC would render as the *previous* day on any negative-offset machine.
 */

import { fiscalYear } from './fiscalYear'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export type ParsedTransactionDate = { ok: true; date: Date | null } | { ok: false; error: string }

/** `YYYY-MM-DD` for a date input's value/max, in the viewer's local zone. */
export function todayInputValue(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Turn a form value into the `createdAt` to store.
 *
 * `{ date: null }` means "leave it to the database default" — returned for a
 * blank value and for today.
 */
export function parseTransactionDate(
  raw: FormDataEntryValue | null | undefined,
  now: Date = new Date(),
): ParsedTransactionDate {
  if (raw === null || raw === undefined) return { ok: true, date: null }
  const value = String(raw).trim()
  if (value === '') return { ok: true, date: null }

  if (!DATE_ONLY.test(value)) return { ok: false, error: 'Enter a valid date' }

  const [y, m, d] = value.split('-').map(Number)
  const stamp = Date.UTC(y, m - 1, d, 12, 0, 0)
  if (Number.isNaN(stamp)) return { ok: false, error: 'Enter a valid date' }

  const date = new Date(stamp)
  // Reject 2025-02-31 and friends: Date.UTC rolls them over silently, so
  // compare the round-trip against what was typed.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, error: 'Enter a valid date' }
  }

  const today = todayInputValue(now)
  if (value > today) {
    return { ok: false, error: 'A share transaction cannot be dated in the future' }
  }
  if (value === today) return { ok: true, date: null }

  return { ok: true, date }
}

/**
 * The fiscal year a typed date would land in, for the live hint under the date
 * input. The March 1 boundary is exactly where a back-dating admin will make a
 * mistake, so the dialog says which year they're about to affect.
 */
export function fiscalYearForInput(value: string): number | null {
  if (!DATE_ONLY.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  if (Number.isNaN(date.getTime())) return null
  return fiscalYear(date)
}

/** `Mar 2024 – Feb 2025`, the span of a fiscal year, for that same hint. */
export function fiscalYearSpanLabel(fy: number): string {
  return `Mar ${fy} – Feb ${fy + 1}`
}
