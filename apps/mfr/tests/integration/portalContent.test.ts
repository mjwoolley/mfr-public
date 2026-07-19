// Integration: the content-admin actions (schedule/links/events), meal RSVP
// toggling, and the getMealsView assembly against the real portal + identity
// test branches. `auth` is mocked to impersonate each role; next/cache and
// redirect are stubbed since there's no request context.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { users } from '@mfr/auth'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { auth } from '@/lib/auth'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { portalSettings, portalEvents, portalMealRsvps } from '@/lib/db/schema'
import { saveSchedule, saveLinks, addEvent, updateEvent, removeEvent } from '@/app/admin/actions'
import { toggleMeal } from '@/app/meals/actions'
import { getMealsView } from '@/lib/portal'

const managerSession = () => ({
  user: {
    id: randomUUID(),
    status: 'approved',
    roles: { siteOwner: false, siteManager: true, accountingManager: false },
  },
  expires: '2099-01-01',
})
const memberSession = (id: string) => ({
  user: {
    id,
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
  },
  expires: '2099-01-01',
})

async function makeApprovedUser(name: string) {
  const [u] = await identityDb
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, name, status: 'approved' })
    .returning()
  return u
}

afterEach(() => vi.mocked(auth).mockReset())

describe('reunion schedule + links', () => {
  it('a content admin saves the schedule (upserts the singleton)', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession() as never)
    const res = await saveSchedule({
      reunionYear: 2027,
      reunionStart: '2027-07-01',
      reunionEnd: '2027-07-05',
    })
    expect(res).toEqual({ ok: true })
    const [row] = await portalDb
      .select()
      .from(portalSettings)
      .where(eq(portalSettings.id, 'singleton'))
    expect(row.reunionYear).toBe(2027)
    expect(row.reunionStart).toBe('2027-07-01')
  })

  it('a content admin saves the links', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession() as never)
    await saveLinks({
      driveUrl: 'https://drive.example/d',
      venmoUrl: 'https://venmo.example/v',
      chatUrl: 'https://chat.example/c',
    })
    const [row] = await portalDb
      .select()
      .from(portalSettings)
      .where(eq(portalSettings.id, 'singleton'))
    expect(row.driveUrl).toBe('https://drive.example/d')
  })

  it('rejects a non-admin member', async () => {
    vi.mocked(auth).mockResolvedValue(memberSession(randomUUID()) as never)
    await expect(saveSchedule({ reunionYear: 2027 })).rejects.toThrow(/REDIRECT/)
  })
})

describe('events', () => {
  it('adds, edits a single-day event, and removes it', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession() as never)
    await addEvent()
    const [ev] = await portalDb.select().from(portalEvents)
    expect(ev).toBeTruthy()

    await updateEvent({
      id: ev.id,
      startDate: '2027-07-04',
      time: 'At dusk',
      description: 'Fireworks',
      meetingLink: '',
    })
    const [updated] = await portalDb.select().from(portalEvents).where(eq(portalEvents.id, ev.id))
    expect(updated.description).toBe('Fireworks')
    expect(updated.startDate).toBe('2027-07-04')
    expect(updated.endDate).toBeNull()
    expect(updated.time).toBe('At dusk')
    expect(updated.meetingLink).toBeNull()

    await removeEvent({ id: ev.id })
    const rows = await portalDb.select().from(portalEvents).where(eq(portalEvents.id, ev.id))
    expect(rows).toHaveLength(0)
  })

  it('stores a multi-day range and clears the (single-day-only) time', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession() as never)
    await addEvent()
    const rows = await portalDb.select().from(portalEvents)
    const ev = rows[rows.length - 1]

    const res = await updateEvent({
      id: ev.id,
      startDate: '2027-07-01',
      endDate: '2027-07-05',
      time: 'ignored on a range',
      description: 'Reunion week',
    })
    expect(res).toEqual({ ok: true })
    const [updated] = await portalDb.select().from(portalEvents).where(eq(portalEvents.id, ev.id))
    expect(updated.startDate).toBe('2027-07-01')
    expect(updated.endDate).toBe('2027-07-05')
    expect(updated.time).toBe('')

    await removeEvent({ id: ev.id })
  })

  it('rejects a range whose end precedes its start', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession() as never)
    await addEvent()
    const rows = await portalDb.select().from(portalEvents)
    const ev = rows[rows.length - 1]

    const res = await updateEvent({ id: ev.id, startDate: '2027-07-05', endDate: '2027-07-01' })
    expect(res).toMatchObject({ error: expect.stringMatching(/on or after/) })

    await removeEvent({ id: ev.id })
  })
})

describe('meals', () => {
  it('a member toggles their own RSVP on and off', async () => {
    const user = await makeApprovedUser('Toggle Tester')
    vi.mocked(auth).mockResolvedValue(memberSession(user.id) as never)

    await toggleMeal({ dayIndex: 2, meal: 'L' })
    let rows = await portalDb
      .select()
      .from(portalMealRsvps)
      .where(
        and(
          eq(portalMealRsvps.identityUserId, user.id),
          eq(portalMealRsvps.dayIndex, 2),
          eq(portalMealRsvps.meal, 'L'),
        ),
      )
    expect(rows).toHaveLength(1)

    await toggleMeal({ dayIndex: 2, meal: 'L' })
    rows = await portalDb
      .select()
      .from(portalMealRsvps)
      .where(
        and(
          eq(portalMealRsvps.identityUserId, user.id),
          eq(portalMealRsvps.dayIndex, 2),
          eq(portalMealRsvps.meal, 'L'),
        ),
      )
    expect(rows).toHaveLength(0)
  })

  it('getMealsView aggregates headcount and sorts the roster by last name', async () => {
    // schedule so buildDays yields a window
    vi.mocked(auth).mockResolvedValue(managerSession() as never)
    await saveSchedule({ reunionYear: 2027, reunionStart: '2027-07-01', reunionEnd: '2027-07-02' })

    const bennett = await makeApprovedUser('Grace Bennett')
    const woolley = await makeApprovedUser('Mark Woolley')
    // both attend day-1 lunch; only Bennett attends day-1 dinner
    for (const u of [bennett, woolley]) {
      vi.mocked(auth).mockResolvedValue(memberSession(u.id) as never)
      await toggleMeal({ dayIndex: 1, meal: 'L' })
    }
    vi.mocked(auth).mockResolvedValue(memberSession(bennett.id) as never)
    await toggleMeal({ dayIndex: 1, meal: 'D' })

    const view = await getMealsView(woolley.id)
    const day1 = view.headcount.find((h) => h.index === 1)!
    expect(day1.lunchCount).toBe(2)
    expect(day1.dinnerCount).toBe(1)
    // roster sorted by last name: Bennett before Woolley
    const names = view.roster.map((r) => r.name)
    expect(names.indexOf('Grace Bennett')).toBeLessThan(names.indexOf('Mark Woolley'))
    expect(view.roster.find((r) => r.name === 'Mark Woolley')?.isYou).toBe(true)
  })
})
