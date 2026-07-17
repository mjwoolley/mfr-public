// getFundraising now reads the accounting ledger in-process (accounting lives
// in this app). The DB singletons + the two ledger/goal reads are mocked because
// importing @/lib/portal pulls them in, and the clients throw at module load
// when their env vars are unset (unit runs).
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identityDb', () => ({ identityDb: {} }))
vi.mock('@/lib/portalDb', () => ({ portalDb: {} }))
vi.mock('@/lib/accounting/ledger', () => ({ getRaisedThisYear: vi.fn() }))
vi.mock('@/lib/accounting/goals', () => ({ getContributionGoal: vi.fn() }))

import { getFundraising } from '@/lib/portal'
import { getRaisedThisYear } from '@/lib/accounting/ledger'
import { getContributionGoal } from '@/lib/accounting/goals'

afterEach(() => vi.resetAllMocks())

describe('getFundraising', () => {
  it('reads the live current-year total + goal in-process', async () => {
    vi.mocked(getRaisedThisYear).mockResolvedValue({ year: 2026, raised: 1234 })
    vi.mocked(getContributionGoal).mockResolvedValue({
      year: 2026,
      amount: '5000',
      updatedAt: new Date(),
    })

    expect(await getFundraising()).toEqual({ year: 2026, raised: 1234, goal: 5000 })
  })

  it('returns a null goal when no goal row is set for the year', async () => {
    vi.mocked(getRaisedThisYear).mockResolvedValue({ year: 2026, raised: 0 })
    vi.mocked(getContributionGoal).mockResolvedValue(null)

    expect(await getFundraising()).toEqual({ year: 2026, raised: 0, goal: null })
  })

  it('degrades to null when the ledger read throws', async () => {
    vi.mocked(getRaisedThisYear).mockRejectedValue(new Error('db down'))
    expect(await getFundraising()).toBeNull()
  })
})
