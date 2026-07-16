import { addDays, nightsBetween } from '@/lib/rules/dateHelpers'

/** "2026-07-03" → "Jul 3" (UTC, matching the rest of the date handling). */
export function niceDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * "Jul 3 → Jul 4" for a reservation's half-open [start, end) range, where the
 * displayed end is the inclusive last night (`endDate − 1`). Storage stays
 * half-open; this is display only, so a stay of Jul 3–4 (checkout Jul 5) reads
 * as its two nights, "Jul 3 → Jul 4".
 */
export function niceRange(startDate: string, endDate: string): string {
  return `${niceDate(startDate)} → ${niceDate(addDays(endDate, -1))}`
}

export function nightsLabel(startDate: string, endDate: string): string {
  const nights = nightsBetween(startDate, endDate)
  return `${nights} night${nights === 1 ? '' : 's'}`
}
