// Date math on ISO YYYY-MM-DD strings, deliberately pinned to UTC: parsing
// with a T00:00:00Z suffix and stepping via setUTCDate means results never
// shift with the server/browser timezone or DST transitions.

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function nightsBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const msPerNight = 24 * 60 * 60 * 1000
  return Math.round((end.getTime() - start.getTime()) / msPerNight)
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  // Half-open ranges [aStart, aEnd) and [bStart, bEnd): overlap iff each
  // range starts before the other ends.
  return aStart < bEnd && bStart < aEnd
}

export function calendarYearOf(dateStr: string): number {
  return Number(dateStr.slice(0, 4))
}

// Today's date as YYYY-MM-DD, pinned to UTC like every other date here so the
// server (Vercel, UTC) and the browser agree on which calendar day "today" is.
// Single source of truth for both the client calendar and the server routes.
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
