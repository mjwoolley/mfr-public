import { describe, it, expect, afterEach, vi } from 'vitest'
import { testDb } from './testDb'

// Same reasoning as reports.test.ts for mocking @/lib/auth and next/cache.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@/lib/auth'
import { setContributionsVisibility } from '@/actions/accounting/settings'
import { setContributionGoal } from '@/actions/accounting/goals'

const ADMIN_SESSION = {
  user: {
    id: 'admin-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: true },
    shareholderId: null,
    email: 'admin@example.com',
    name: 'Admin',
  },
  expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const NON_ADMIN_SESSION = {
  user: {
    id: 'shareholder-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
    shareholderId: 'sh_1',
    email: 'shareholder@example.com',
    name: 'Not An Admin',
  },
  expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

// A far-past year no other fixture uses, so tests can't collide.
const GOAL_TEST_YEAR = 2001

afterEach(async () => {
  vi.mocked(auth).mockReset()
  // Restore the default visibility and drop the test goal.
  await testDb.appSettings
    .update({ where: { id: 'singleton' }, data: { contributionsVisibleToAll: true } })
    .catch(() => {})
  await testDb.contributionGoal.delete({ where: { year: GOAL_TEST_YEAR } }).catch(() => {})
})

describe('setContributionsVisibility — admin-only', () => {
  it('rejects a non-admin caller', async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
    await expect(setContributionsVisibility(false)).rejects.toThrow()
  })

  it('persists the admins-only setting for an admin (and back)', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    await setContributionsVisibility(false)
    let settings = await testDb.appSettings.findUnique({ where: { id: 'singleton' } })
    expect(settings?.contributionsVisibleToAll).toBe(false)

    await setContributionsVisibility(true)
    settings = await testDb.appSettings.findUnique({ where: { id: 'singleton' } })
    expect(settings?.contributionsVisibleToAll).toBe(true)
  })
})

describe('setContributionGoal — admin-only', () => {
  it('rejects a non-admin caller and stores nothing', async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
    await expect(
      setContributionGoal(undefined, fd({ year: String(GOAL_TEST_YEAR), amount: '9999' })),
    ).rejects.toThrow()

    const goal = await testDb.contributionGoal.findUnique({ where: { year: GOAL_TEST_YEAR } })
    expect(goal).toBeNull()
  })

  it("upserts the year's goal for an admin", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)

    let result = await setContributionGoal(
      undefined,
      fd({ year: String(GOAL_TEST_YEAR), amount: '12000' }),
    )
    expect(result?.saved).toBe(true)

    result = await setContributionGoal(
      undefined,
      fd({ year: String(GOAL_TEST_YEAR), amount: '15000' }),
    )
    expect(result?.saved).toBe(true)

    const goal = await testDb.contributionGoal.findUnique({ where: { year: GOAL_TEST_YEAR } })
    expect(goal?.amount.toString()).toBe('15000')
  })

  it('rejects a non-positive goal amount', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const result = await setContributionGoal(
      undefined,
      fd({ year: String(GOAL_TEST_YEAR), amount: '0' }),
    )
    expect(result?.error).toMatch(/greater than zero/i)
  })
})
