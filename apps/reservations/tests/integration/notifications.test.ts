import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { reservations, bookingRules, activityLog } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// Same auth seam as reservations.test.ts (also prevents lib/auth/config's
// top-level NextAuth() from opening a second real postgres client).
vi.mock('../../lib/auth/config', () => ({ auth: vi.fn() }))

// Mock ONLY the SES boundary — lib/notifications runs for real here, so
// these tests exercise the actual recipient query against testIdentityDb.
vi.mock('../../lib/email', () => ({
  sendEmail: vi.fn(),
  appUrl: (p: string) => p,
}))

import { auth } from '../../lib/auth/config'
import { sendEmail } from '../../lib/email'
import { POST } from '../../app/reservations/api/reservations/route'
import { PATCH, DELETE } from '../../app/reservations/api/reservations/[id]/route'

const createdUserIds: string[] = []

function mockSessionFor(user: { id: string; isReservationsAdmin?: boolean; email?: string | null }) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      status: 'approved',
      isReservationsAdmin: user.isReservationsAdmin ?? false,
      isAccountingAdmin: false,
      email: user.email ?? undefined,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

async function makeUser(suffix: string, overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await testIdentityDb
    .insert(users)
    .values({ email: `notif-test-${suffix}-${Date.now()}-${Math.random()}@example.com`, status: 'approved', ...overrides })
    .returning()
  createdUserIds.push(user.id)
  return user
}

async function createReservation(user: { id: string }, startDate: string, endDate: string) {
  const [row] = await testDb
    .insert(reservations)
    .values({ userId: user.id, startDate, endDate, status: 'confirmed' })
    .returning()
  return row
}

beforeAll(async () => {
  await testDb
    .insert(bookingRules)
    .values({ id: 1, bookingHorizonDate: '2028-12-31', maxConsecutiveNights: 7, maxNightsPerUserPerYear: 14 })
    .onConflictDoUpdate({
      target: bookingRules.id,
      set: { bookingHorizonDate: '2028-12-31', maxConsecutiveNights: 7, maxNightsPerUserPerYear: 14 },
    })
})

afterEach(async () => {
  vi.mocked(auth).mockReset()
  vi.mocked(sendEmail).mockReset()
  for (const userId of createdUserIds) {
    await testDb.delete(activityLog).where(eq(activityLog.actorUserId, userId))
    await testDb.delete(reservations).where(eq(reservations.userId, userId))
    await testIdentityDb.delete(users).where(eq(users.id, userId))
  }
  createdUserIds.length = 0
})

describe('reservation notification emails', () => {
  it('POST sends a confirmation to the booker, CCing approved admins but not pending ones', async () => {
    const booker = await makeUser('booker')
    const approvedAdmin = await makeUser('admin-ok', { isReservationsAdmin: true })
    const pendingAdmin = await makeUser('admin-pending', { isReservationsAdmin: true, status: 'pending' })
    mockSessionFor(booker)

    const response = await POST(
      new Request('http://localhost/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ startDate: '2027-03-01', endDate: '2027-03-04' }),
      }) as never
    )
    expect(response.status).toBe(201)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe(booker.email)
    expect(call.cc).toContain(approvedAdmin.email)
    expect(call.cc).not.toContain(pendingAdmin.email)
    expect(call.cc).not.toContain(booker.email)
    expect(call.subject).toContain('Reservation confirmed')
  })

  it('POST does not send when validation rejects the reservation', async () => {
    const booker = await makeUser('booker-invalid')
    mockSessionFor(booker)

    const response = await POST(
      new Request('http://localhost/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ startDate: '2029-07-01', endDate: '2029-07-05' }), // past horizon
      }) as never
    )
    expect(response.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('admin-created reservation does not CC the admin on their own confirmation', async () => {
    const adminBooker = await makeUser('admin-booker', { isReservationsAdmin: true })
    const otherAdmin = await makeUser('admin-other', { isReservationsAdmin: true })
    mockSessionFor(adminBooker)

    const response = await POST(
      new Request('http://localhost/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ startDate: '2027-04-01', endDate: '2027-04-03' }),
      }) as never
    )
    expect(response.status).toBe(201)
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe(adminBooker.email)
    expect(call.cc).toContain(otherAdmin.email)
    expect(call.cc).not.toContain(adminBooker.email)
  })

  it('PATCH by an admin notifies the owner with changed-by and replyTo the admin', async () => {
    const owner = await makeUser('owner-edit')
    const admin = await makeUser('admin-edit', { isReservationsAdmin: true, name: 'Ada Admin' })
    const reservation = await createReservation(owner, '2027-05-01', '2027-05-04')
    mockSessionFor(admin)

    const response = await PATCH(
      new Request(`http://localhost/api/reservations/${reservation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ startDate: '2027-05-02', endDate: '2027-05-05' }),
      }) as never,
      { params: Promise.resolve({ id: reservation.id }) }
    )
    expect(response.status).toBe(200)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe(owner.email)
    expect(call.cc).toContain(admin.email)
    expect(call.subject).toContain('Reservation updated')
    expect(call.replyTo).toBe(admin.email)
    const props = (call.react as React.ReactElement<Record<string, unknown>>).props
    expect(props.changedByName).toBe('Ada Admin')
  })

  it('PATCH with unchanged dates succeeds without sending an email', async () => {
    const owner = await makeUser('owner-nochange')
    const reservation = await createReservation(owner, '2027-06-01', '2027-06-04')
    mockSessionFor(owner)

    const response = await PATCH(
      new Request(`http://localhost/api/reservations/${reservation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ startDate: '2027-06-01', endDate: '2027-06-04' }),
      }) as never,
      { params: Promise.resolve({ id: reservation.id }) }
    )
    expect(response.status).toBe(200)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('DELETE notifies the owner once; a repeat DELETE is idempotent and sends nothing', async () => {
    const owner = await makeUser('owner-cancel')
    const reservation = await createReservation(owner, '2027-08-01', '2027-08-04')
    mockSessionFor(owner)

    const first = await DELETE(
      new Request(`http://localhost/api/reservations/${reservation.id}`, { method: 'DELETE' }) as never,
      { params: Promise.resolve({ id: reservation.id }) }
    )
    expect(first.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe(owner.email)
    expect(call.subject).toContain('Reservation cancelled')

    const second = await DELETE(
      new Request(`http://localhost/api/reservations/${reservation.id}`, { method: 'DELETE' }) as never,
      { params: Promise.resolve({ id: reservation.id }) }
    )
    expect(second.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
})
