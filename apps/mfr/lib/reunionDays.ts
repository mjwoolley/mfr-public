// Pure reunion day-list helpers — no DB imports, so both server data-access
// (lib/portal.ts) and client admin editors can share them.

export interface ReunionDay {
  index: number // 1-based
  dow: string // "Sat"
  dowLong: string // "Saturday"
  date: string // "Jul 1"
}

function parseD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Every day in the inclusive reunion window gets a lunch + dinner slot; capped
 * at 21 days. Ports the prototype's buildDays. */
export function buildDays(start?: string | null, end?: string | null): ReunionDay[] {
  if (!start || !end) return []
  const s = parseD(start)
  const e = parseD(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return []
  const out: ReunionDay[] = []
  const cur = new Date(s)
  let i = 0
  while (cur <= e && i < 21) {
    out.push({
      index: i + 1,
      dow: cur.toLocaleDateString('en-US', { weekday: 'short' }),
      dowLong: cur.toLocaleDateString('en-US', { weekday: 'long' }),
      date: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })
    cur.setDate(cur.getDate() + 1)
    i++
  }
  return out
}
