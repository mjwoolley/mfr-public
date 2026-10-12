// Requirement test for the Reservations landing (CAP-022): an approved member
// opening Reservations is taken to the cabin calendar.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  // Next's redirect() throws to abort rendering; mirror that.
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))

import { auth } from '@/lib/auth'
import RootPage from './page'

describe('CAP-022 Cabin calendar — landing', () => {
  it('CAP-022 · Reservations open on the calendar for the current month (landing goes to the calendar)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: 'u1',
        status: 'approved',
        roles: { siteOwner: false, siteManager: false, accountingManager: false },
      },
      expires: '2099-01-01',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT /reservations/calendar')
  })
})
