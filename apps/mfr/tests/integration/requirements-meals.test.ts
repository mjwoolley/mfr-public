// Requirements coverage for CAP-011 Meal RSVPs against the real portal +
// identity test branch: marks only ever change the signed-in member's own
// attendance, and pending/blocked accounts never appear in the roster or the
// headcounts. Same mock trio as portalContent.test.ts.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
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
import { portalMealRsvps } from '@/lib/db/schema'
import { saveSchedule } from '@/app/admin/actions'
import { toggleMeal } from '@/app/meals/actions'
import { getMealsView } from '@/lib/portal'

const noRoles = { siteOwner: false, siteManager: false, accountingManager: false }
const sessionFor = (id: string, roles = noRoles) => ({
  user: { id, status: 'approved', roles },
  expires: '2099-01-01',
})

const created: string[] = []

async function makeUser(name: string, status: 'pending' | 'approved' | 'blocked' = 'approved') {
  const [u] = await identityDb
    .insert(users)
    .values({ email: `req-meals-${randomUUID()}@example.com`, name, status })
    .returning()
  created.push(u.id)
  return u
}

async function rsvpsOf(userId: string) {
  return portalDb.select().from(portalMealRsvps).where(eq(portalMealRsvps.identityUserId, userId))
}

beforeAll(async () => {
  vi.mocked(auth).mockResolvedValue(
    sessionFor(randomUUID(), { ...noRoles, siteManager: true }) as never,
  )
  await saveSchedule({ reunionYear: 2027, reunionStart: '2027-07-01', reunionEnd: '2027-07-03' })
  vi.mocked(auth).mockReset()
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  if (created.length) {
    await portalDb.delete(portalMealRsvps).where(inArray(portalMealRsvps.identityUserId, created))
    await identityDb.delete(users).where(inArray(users.id, created))
  }
  created.length = 0
})

describe('CAP-011 Meal RSVPs (integration)', () => {
  it('CAP-011 · I can only mark my own meals', async () => {
    const ann = await makeUser('Ann Owncheck')
    const bob = await makeUser('Bob Owncheck')

    // Bob has marked dinner on day 1.
    vi.mocked(auth).mockResolvedValue(sessionFor(bob.id) as never)
    await toggleMeal({ dayIndex: 1, meal: 'D' })

    // Ann toggles the same meal, even trying to name Bob in the request.
    vi.mocked(auth).mockResolvedValue(sessionFor(ann.id) as never)
    await toggleMeal({ dayIndex: 1, meal: 'D', identityUserId: bob.id, userId: bob.id } as never)
    expect(await rsvpsOf(ann.id)).toHaveLength(1)
    expect(await rsvpsOf(bob.id)).toHaveLength(1)

    // …and unmarking again only removes Ann's own mark.
    await toggleMeal({ dayIndex: 1, meal: 'D', identityUserId: bob.id } as never)
    expect(await rsvpsOf(ann.id)).toHaveLength(0)
    expect(await rsvpsOf(bob.id)).toHaveLength(1)
  })

  it('CAP-011 · Pending and blocked people are not on the roster', async () => {
    const me = await makeUser('Mia Rostercheck')
    const pending = await makeUser('Pat Pendingperson', 'pending')
    const blocked = await makeUser('Blair Blockedperson', 'blocked')

    // Their marks exist (e.g. made before they were blocked) …
    await portalDb.insert(portalMealRsvps).values([
      { identityUserId: pending.id, dayIndex: 1, meal: 'L' },
      { identityUserId: blocked.id, dayIndex: 1, meal: 'L' },
      { identityUserId: me.id, dayIndex: 1, meal: 'L' },
    ])

    const view = await getMealsView(me.id)

    // … but they appear in neither the grid nor the headcounts.
    const ids = view.roster.map((r) => r.id)
    expect(ids).toContain(me.id)
    expect(ids).not.toContain(pending.id)
    expect(ids).not.toContain(blocked.id)
    const day1 = view.headcount.find((h) => h.date === 'Jul 1')!
    expect(day1.lunchNames).toContain('Mia')
    expect(day1.lunchNames).not.toContain('Pat')
    expect(day1.lunchNames).not.toContain('Blair')
    // Only approved markers are counted (other suites' approved users may
    // have marks too, so compare against the approved subset).
    const approvedMarkers = view.roster.filter((r) => r.cells[0]?.lunch).length
    expect(day1.lunchCount).toBe(approvedMarkers)
  })
})
