// Requirement coverage for CAP-003 · Unapproved accounts cannot act behind the
// screens (requirements/accounts/access-for-unapproved-accounts.md): a pending
// or blocked person calling the reservation API directly to book, change or
// cancel is refused, nothing is saved, and no email is sent.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { reservations, activityLog } from '../../lib/db/schema'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('../../lib/reservations/notifications', () => ({
  sendReservationCreatedEmail: vi.fn(),
  sendReservationUpdatedEmail: vi.fn(),
  sendReservationCancelledEmail: vi.fn(),
}))

import { auth } from '@/lib/auth'
import * as notifications from '../../lib/reservations/notifications'
import { POST as book } from '../../app/reservations/api/reservations/route'
import {
  PATCH as change,
  DELETE as cancel,
} from '../../app/reservations/api/reservations/[id]/route'

type Status = 'pending' | 'blocked'

const createdUserIds: string[] = []

async function makeUser(status: Status) {
  const [row] = await testIdentityDb
    .insert(users)
    .values({ email: `req-unapproved-${randomUUID()}@example.com`, status })
    .returning()
  createdUserIds.push(row.id)
  return row
}

function signInAs(user: { id: string; email: string }, status: Status) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      email: user.email,
      status,
      roles: { siteOwner: false, siteManager: false, accountingManager: false },
    },
    expires: '2099-01-01',
  } as never)
}

function expectNothingSent() {
  expect(notifications.sendReservationCreatedEmail).not.toHaveBeenCalled()
  expect(notifications.sendReservationUpdatedEmail).not.toHaveBeenCalled()
  expect(notifications.sendReservationCancelledEmail).not.toHaveBeenCalled()
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  vi.clearAllMocks()
  if (createdUserIds.length) {
    await testDb.delete(reservations).where(inArray(reservations.userId, createdUserIds))
    await testDb.delete(activityLog).where(inArray(activityLog.actorUserId, createdUserIds))
    await testIdentityDb.delete(users).where(inArray(users.id, createdUserIds))
    createdUserIds.length = 0
  }
})

describe('CAP-003 · Unapproved accounts cannot act behind the screens', () => {
  it.each(['pending', 'blocked'] as const)(
    'CAP-003 · a %s account cannot book a stay',
    async (status) => {
      const person = await makeUser(status)
      signInAs(person, status)

      const res = await book(
        new NextRequest('http://localhost/reservations/api/reservations', {
          method: 'POST',
          body: JSON.stringify({ startDate: '2043-06-01', endDate: '2043-06-04' }),
        }),
      )

      expect(res.status).toBe(403)
      const saved = await testDb
        .select()
        .from(reservations)
        .where(eq(reservations.userId, person.id))
      expect(saved).toHaveLength(0)
      expectNothingSent()
    },
  )

  it.each([
    ['pending', '2043-07-01', '2043-07-04'],
    ['blocked', '2043-08-01', '2043-08-04'],
  ] as const)(
    'CAP-003 · a %s account cannot change or cancel its own reservation',
    async (status, startDate, endDate) => {
      const person = await makeUser(status)
      // A stay booked back when they were approved.
      const [stay] = await testDb
        .insert(reservations)
        .values({ userId: person.id, startDate, endDate, status: 'confirmed' })
        .returning()
      signInAs(person, status)
      const params = { params: Promise.resolve({ id: stay.id }) }

      const patched = await change(
        new NextRequest(`http://localhost/reservations/api/reservations/${stay.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ startDate: '2043-09-01', endDate: '2043-09-03' }),
        }),
        params,
      )
      const deleted = await cancel(
        new NextRequest(`http://localhost/reservations/api/reservations/${stay.id}`, {
          method: 'DELETE',
        }),
        params,
      )

      expect(patched.status).toBe(403)
      expect(deleted.status).toBe(403)
      const [after] = await testDb.select().from(reservations).where(eq(reservations.id, stay.id))
      expect(after).toMatchObject({ startDate, endDate, status: 'confirmed', cancelledAt: null })
      const activity = await testDb
        .select()
        .from(activityLog)
        .where(eq(activityLog.actorUserId, person.id))
      expect(activity).toHaveLength(0)
      expectNothingSent()
    },
  )
})
