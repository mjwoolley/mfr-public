// Integration: CAP-029 "A failed email does not undo the booking". The
// notifications module runs for real (recipient lookup against the test
// identity DB); only the SES hand-off is mocked, and it fails.

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { reservations, bookingRules, activityLog } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// See reservations.test.ts for why `auth` is mocked.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('../../lib/reservations/email', () => ({
  sendEmail: vi.fn(),
  appUrl: (p: string) => p,
}))

import { auth } from '@/lib/auth'
import { sendEmail } from '../../lib/reservations/email'
import { POST } from '../../app/reservations/api/reservations/route'

const RULES = {
  bookingHorizonDate: '2030-12-31',
  maxConsecutiveNights: 14,
  maxNightsPerUserPerYear: 60,
}
const createdUserIds: string[] = []

beforeAll(async () => {
  await testDb
    .insert(bookingRules)
    .values({ id: 1, ...RULES })
    .onConflictDoUpdate({ target: bookingRules.id, set: RULES })
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  vi.mocked(sendEmail).mockReset()
  if (createdUserIds.length) {
    await testDb.delete(activityLog).where(inArray(activityLog.actorUserId, createdUserIds))
    await testDb.delete(reservations).where(inArray(reservations.userId, createdUserIds))
    await testIdentityDb.delete(users).where(inArray(users.id, createdUserIds))
    createdUserIds.length = 0
  }
})

describe('CAP-029 Reservation emails — delivery failure', () => {
  it('CAP-029 · A failed email does not undo the booking (stay still confirmed)', async () => {
    const [me] = await testIdentityDb
      .insert(users)
      .values({ email: `req-mail-${Date.now()}-${Math.random()}@example.com`, status: 'approved' })
      .returning()
    createdUserIds.push(me.id)
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: me.id,
        status: 'approved',
        roles: { siteOwner: false, siteManager: false, accountingManager: false },
      },
      expires: '2099-01-01',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(sendEmail).mockRejectedValue(new Error('SES unavailable'))

    const res = await POST(
      new NextRequest('http://localhost/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ startDate: '2029-05-20', endDate: '2029-05-23' }),
      }),
    )

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(201)
    const rows = await testDb.select().from(reservations).where(eq(reservations.userId, me.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('confirmed')
  })
})
