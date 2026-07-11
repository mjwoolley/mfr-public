import { nightsBetween } from '@/lib/rules/dateHelpers'

/** "2026-07-03" → "Jul 3" (UTC, matching the rest of the date handling). */
export function niceDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** "Jul 3 → Jul 5" for a reservation's [start, end) range. */
export function niceRange(startDate: string, endDate: string): string {
  return `${niceDate(startDate)} → ${niceDate(endDate)}`
}

export function nightsLabel(startDate: string, endDate: string): string {
  const nights = nightsBetween(startDate, endDate)
  return `${nights} night${nights === 1 ? '' : 's'}`
}
