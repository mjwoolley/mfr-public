// Read-side data access for the portal: the settings singleton, photo
// albums, events, the live fundraising fetch from accounting, and the whole
// Meals page view assembly. Writes live in app/admin/actions.ts and
// app/meals/actions.ts.

import { asc, desc, eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { ACCOUNTING_URL } from '@mfr/ui'
import { buildDays, type ReunionDay } from '@/lib/reunionDays'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import {
  portalSettings,
  portalPhotoAlbums,
  portalEvents,
  portalMealRsvps,
  type PortalSettingsRow,
} from '@/lib/db/schema'

// ── Settings ────────────────────────────────────────────────────────────────

/** Single-row settings, self-seeding on first read (like accounting's). */
export async function getPortalSettings(): Promise<PortalSettingsRow> {
  const [row] = await portalDb
    .insert(portalSettings)
    .values({ id: 'singleton' })
    .onConflictDoNothing()
    .returning()
  if (row) return row
  const [existing] = await portalDb
    .select()
    .from(portalSettings)
    .where(eq(portalSettings.id, 'singleton'))
  return existing
}

// ── Fundraising (live read from accounting) ──────────────────────────────────

export interface Fundraising {
  year: number
  raised: number
  goal: number | null
}

/** Live current-year contribution total + goal from the accounting app's public
 * API — not a duplicated number. Returns null if accounting is unreachable so
 * the home card can degrade gracefully. */
export async function getFundraising(): Promise<Fundraising | null> {
  try {
    // On staging, the accounting deployment sits behind Vercel Deployment
    // Protection, which 401s server-to-server fetches. When ACCOUNTING_BYPASS_SECRET
    // is set (staging Preview env only) send the bypass header so the request is
    // authorized; in production, where protection is off, the env is unset and
    // no header is sent — a plain public fetch.
    const bypass = process.env.ACCOUNTING_BYPASS_SECRET
    const res = await fetch(`${ACCOUNTING_URL}/api/contributions/current-year`, {
      next: { revalidate: 60 },
      ...(bypass ? { headers: { 'x-vercel-protection-bypass': bypass } } : {}),
    })
    if (!res.ok) return null
    return (await res.json()) as Fundraising
  } catch {
    return null
  }
}

// ── Photo albums ─────────────────────────────────────────────────────────────

export async function getPhotoAlbums() {
  return portalDb.select().from(portalPhotoAlbums).orderBy(desc(portalPhotoAlbums.year))
}

// ── Events ───────────────────────────────────────────────────────────────────

export async function getEvents() {
  return portalDb.select().from(portalEvents).orderBy(asc(portalEvents.startDate))
}

// ── Meals ────────────────────────────────────────────────────────────────────

export interface Attendee {
  id: string
  firstName: string
  lastName: string
  name: string
}

/** Everyone with site access = approved identity users. Names are derived from
 * the identity `name` (split on the last space); a later refinement could store
 * structured names. Sorted by last name, then first. */
export async function getAttendees(): Promise<Attendee[]> {
  const rows = await identityDb
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.status, 'approved'))
  return rows
    .map((u) => {
      const display = (u.name ?? u.email.split('@')[0]).trim()
      const parts = display.split(/\s+/)
      const firstName = parts[0] ?? display
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : ''
      return { id: u.id, firstName, lastName, name: display }
    })
    .sort(
      (a, b) =>
        (a.lastName || a.firstName).localeCompare(b.lastName || b.firstName) ||
        a.firstName.localeCompare(b.firstName),
    )
}

export interface MealsView {
  days: ReunionDay[]
  rangeLabel: string
  your: { index: number; dow: string; date: string; lunch: boolean; dinner: boolean }[]
  headcount: {
    index: number
    dow: string
    date: string
    lunchCount: number
    lunchNames: string
    dinnerCount: number
    dinnerNames: string
  }[]
  peakLabel: string
  roster: {
    id: string
    name: string
    isYou: boolean
    initials: string
    cells: { lunch: boolean; dinner: boolean }[]
  }[]
  userTotal: number
}

/** Assembles the whole Meals page view from settings + attendees + RSVPs. */
export async function getMealsView(currentUserId: string): Promise<MealsView> {
  const settings = await getPortalSettings()
  const days = buildDays(settings.reunionStart, settings.reunionEnd)
  const [attendees, rsvps] = await Promise.all([
    getAttendees(),
    portalDb.select().from(portalMealRsvps),
  ])

  // presence set keyed "userId:indexMeal", e.g. "abc:3L"
  const has = new Set(rsvps.map((r) => `${r.identityUserId}:${r.dayIndex}${r.meal}`))
  const on = (userId: string, index: number, meal: 'L' | 'D') =>
    has.has(`${userId}:${index}${meal}`)

  const your = days.map((d) => ({
    index: d.index,
    dow: d.dow,
    date: d.date,
    lunch: on(currentUserId, d.index, 'L'),
    dinner: on(currentUserId, d.index, 'D'),
  }))

  const headcount = days.map((d) => {
    const l = attendees.filter((a) => on(a.id, d.index, 'L'))
    const din = attendees.filter((a) => on(a.id, d.index, 'D'))
    return {
      index: d.index,
      dow: d.dow,
      date: d.date,
      lunchCount: l.length,
      lunchNames: l.length ? l.map((a) => a.firstName).join(', ') : 'No one yet',
      dinnerCount: din.length,
      dinnerNames: din.length ? din.map((a) => a.firstName).join(', ') : 'No one yet',
    }
  })

  // Busiest single meal across the week — linear scan over days × 2 meals;
  // earlier day/meal wins ties (count must strictly beat the current peak).
  let peak = { count: -1, label: 'Nothing planned yet' }
  for (const d of days) {
    for (const [meal, word] of [
      ['L', 'lunch'],
      ['D', 'dinner'],
    ] as const) {
      const c = attendees.filter((a) => on(a.id, d.index, meal)).length
      if (c > peak.count) peak = { count: c, label: `${d.dow} ${d.date} ${word} · ${c} people` }
    }
  }

  const roster = attendees.map((a) => ({
    id: a.id,
    name: a.name,
    isYou: a.id === currentUserId,
    // First+last initials; single-word names fall back to their first two
    // letters so every avatar still gets two characters.
    initials: ((a.firstName[0] ?? '') + (a.lastName[0] ?? a.firstName[1] ?? '')).toUpperCase(),
    cells: days.map((d) => ({ lunch: on(a.id, d.index, 'L'), dinner: on(a.id, d.index, 'D') })),
  }))

  const userTotal = your.reduce((n, d) => n + (d.lunch ? 1 : 0) + (d.dinner ? 1 : 0), 0)
  const rangeLabel = days.length
    ? `${days[0].date} – ${days[days.length - 1].date}`
    : 'Dates to be set'

  return { days, rangeLabel, your, headcount, peakLabel: peak.label, roster, userTotal }
}
