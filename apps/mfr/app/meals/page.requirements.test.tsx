// Requirements coverage for CAP-011 Meal RSVPs (requirements/reunion/meal-rsvps.md):
// the Meals page as a member sees it — week header, per-day headcounts with
// names, the "Biggest meal so far" callout (with earliest-wins ties), the
// family grid, and the not-yet-scheduled state. The real getMealsView runs; only
// the two DB clients are faked with in-memory rows (approved users only — the
// status filter itself is a SQL WHERE, covered by
// tests/integration/requirements-meals.test.ts).
//
// The feature's Background says "Saturday, July 1 to Wednesday, July 5"; that
// is only true in 2023 (Jul 1 2026 is a Wednesday), so the fixtures use 2023 to
// keep the scenario's weekday wording ("Sun Jul 2") literally checkable.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

type Rsvp = { identityUserId: string; dayIndex: number; meal: 'L' | 'D' }
type U = { id: string; name: string | null; email: string }

const { state, requireApprovedMock } = vi.hoisted(() => ({
  state: {
    settings: {} as Record<string, unknown>,
    users: [] as U[],
    rsvps: [] as Rsvp[],
  },
  requireApprovedMock: vi.fn(),
}))

vi.mock('@/lib/authz', () => ({ requireApproved: requireApprovedMock }))
vi.mock('@/lib/accounting/ledger', () => ({ getRaisedThisYear: vi.fn() }))
vi.mock('@/lib/accounting/goals', () => ({ getContributionGoal: vi.fn() }))
vi.mock('./actions', () => ({ toggleMeal: vi.fn() }))
vi.mock('@/lib/identityDb', () => ({
  identityDb: {
    select: () => ({ from: () => ({ where: async () => state.users }) }),
  },
}))
vi.mock('@/lib/portalDb', () => ({
  portalDb: {
    // getPortalSettings: insert … onConflictDoNothing().returning() seeds/returns the row.
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: async () => [state.settings] }) }),
    }),
    // getMealsView: select().from(portalMealRsvps)
    select: () => ({ from: async () => state.rsvps }),
  },
}))

import MealsPage from './page'

const ME = 'me-0000'

function schedule(start: string | null, end: string | null, year = 2023) {
  state.settings = {
    id: 'singleton',
    reunionYear: year,
    reunionStart: start,
    reunionEnd: end,
    driveUrl: '',
    venmoUrl: '',
    chatUrl: '',
    updatedAt: new Date(),
  }
}

function people(n: number, prefix = 'Person'): U[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix}${i} Family`,
    email: `${prefix.toLowerCase()}${i}@example.com`,
  }))
}

function mark(ids: string[], dayIndex: number, meal: 'L' | 'D') {
  for (const id of ids) state.rsvps.push({ identityUserId: id, dayIndex, meal })
}

async function render() {
  return renderToStaticMarkup(await MealsPage())
}

/** The per-day headcount card for `date` ("Jul 2"), as markup. */
function dayCard(html: string, date: string) {
  const start = html.indexOf(`>${date}</span></div>`)
  expect(start).toBeGreaterThan(-1)
  return html.slice(start, html.indexOf('</div></div></div>', start))
}

const text = (html: string) => html.replace(/<[^>]+>/g, '')

beforeEach(() => {
  requireApprovedMock.mockResolvedValue({
    user: { id: ME, email: 'me@example.com', status: 'approved', roles: {} },
  })
  schedule('2023-07-01', '2023-07-05')
  state.users = [{ id: ME, name: 'Mary Me', email: 'me@example.com' }]
  state.rsvps = []
})

describe('CAP-011 Meal RSVPs — Meals page', () => {
  it('CAP-011 · Every reunion day has a lunch and a dinner', async () => {
    const html = await render()
    expect(html).toContain('Who’s here for which meals?')
    expect(text(html)).toContain('Reunion week · Jul 1 – Jul 5, 2023')
    expect(html).toContain('Your meals')
    for (const d of ['Jul 1', 'Jul 2', 'Jul 3', 'Jul 4', 'Jul 5']) expect(html).toContain(d)
    // "Your meals" offers a Lunch and a Dinner button for each of the 5 days.
    expect(html.match(/<button[^>]*>Lunch<\/button>/g)).toHaveLength(5)
    expect(html.match(/<button[^>]*>Dinner<\/button>/g)).toHaveLength(5)
  })

  it('CAP-011 · Each day shows its headcount and who is coming', async () => {
    state.users.push(
      { id: 'ann', name: 'Ann Adams', email: 'ann@example.com' },
      { id: 'bob', name: 'Bob Brown', email: 'bob@example.com' },
    )
    mark(['ann', 'bob'], 2, 'D')

    const card = text(dayCard(await render(), 'Jul 2'))
    expect(card).toMatch(/Lunch\s*0\s*No one yet/)
    expect(card).toMatch(/Dinner\s*2\s*Ann, Bob/)
  })

  it('CAP-011 · The biggest meal is called out', async () => {
    const crowd = people(12)
    state.users.push(...crowd)
    mark(
      crowd.map((p) => p.id),
      2,
      'D',
    )
    mark(
      crowd.slice(0, 5).map((p) => p.id),
      1,
      'L',
    )

    const html = text(await render())
    expect(html).toContain('Biggest meal so far')
    expect(html).toContain('Sun Jul 2 dinner · 12 people')
  })

  it('CAP-011 · Ties go to the earliest meal', async () => {
    const crowd = people(8)
    state.users.push(...crowd)
    const ids = crowd.map((p) => p.id)
    mark(ids, 3, 'D') // Jul 3 dinner: 8 (added first, so storage order can't decide)
    mark(ids, 1, 'L') // Jul 1 lunch: 8
    mark(ids.slice(0, 7), 2, 'L') // no meal has more than 8

    const html = text(await render())
    expect(html).toContain('Sat Jul 1 lunch · 8 people')
    expect(html).not.toContain('Jul 3 dinner · 8 people')
  })

  it('CAP-011 · The family grid shows everyone with access', async () => {
    state.users.push(
      { id: 'z', name: 'Zed Zimmer', email: 'z@example.com' },
      { id: 'a', name: 'Al Abbott', email: 'a@example.com' },
    )
    mark(['a'], 1, 'L')

    const html = await render()
    const grid = html.slice(html.indexOf('Everyone’s meals'))
    expect(grid).toContain('Sorted by last name')
    // Every approved member, by last name: Abbott, Me, Zimmer.
    const order = ['Al Abbott', 'Mary Me', 'Zed Zimmer'].map((n) => grid.indexOf(n))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
    // A lunch and a dinner dot for each of the 5 days, for each of 3 people.
    const dots = grid.match(/border-radius:50%;display:inline-block/g) ?? []
    expect(dots).toHaveLength(3 * 5 * 2)
    // Exactly one filled lunch dot: Al's Jul 1 lunch.
    expect(
      grid.match(/display:inline-block;flex-shrink:0;background:var\(--color-accent\)"/g),
    ).toHaveLength(1)
    // My row — and only my row — is highlighted and marked "(you)".
    const rowBackgrounds = [...grid.matchAll(/style="padding:9px 0;[^"]*background:([^;"]+)/g)].map(
      (m) => m[1],
    )
    expect(rowBackgrounds).toEqual(['transparent', 'var(--color-accent-100)', 'transparent'])
    expect(text(grid).match(/\(you\)/g)).toHaveLength(1)
    expect(text(grid)).toContain('Mary Me (you)')
  })

  it('CAP-011 · Reunion dates not set', async () => {
    schedule(null, null)
    const html = text(await render())
    expect(html).toContain('The reunion dates aren’t set yet — check back once Admin adds them.')
    expect(html).toContain('Dates to be set')
    expect(html).toMatch(/Biggest meal so far\s*Nothing planned yet/)
  })
})
