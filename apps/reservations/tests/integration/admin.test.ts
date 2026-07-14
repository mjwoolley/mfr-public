import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { blockedDates, activityLog, bookingRules } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// See tests/integration/reservations.test.ts for why `auth` is mocked: the
// route handlers under test call requireReservationsAdmin/requirePortalAdmin
// -> requireApprovedUser() -> requireUser() -> auth() from
// lib/auth/config.ts. Leaving that unmocked pulls in lib/auth/config.ts's
// top-level NextAuth({ adapter: DrizzleAdapter(identityDb, ...), ... }) call,
// which imports `next/server` — a module that only resolves inside the
// Next.js runtime, not under plain Vitest. It also instantiates a second
// real postgres-js client at import time. Mocking the module avoids both
// problems and lets each test control exactly which session (admin or not)
// the route handler sees.
vi.mock('../../lib/auth/config', () => ({ auth: vi.fn() }))

import { auth } from '../../lib/auth/config'
import { PATCH as patchUser } from '../../app/reservations/api/admin/users/[id]/route'
import { POST as postBlockedDate } from '../../app/reservations/api/admin/blocked-dates/route'
import { PATCH as patchRules } from '../../app/reservations/api/admin/booking-rules/route'

const createdUserIds: string[] = []

async function makeAdmin(suffix: string) {
  const [admin] = await testIdentityDb
    .insert(users)
    .values({
      email: `admin-test-actor-${suffix}-${Date.now()}-${Math.random()}@example.com`,
      status: 'approved',
      isReservationsAdmin: true,
    })
    .returning()
  createdUserIds.push(admin.id)
  return admin
}

function mockSessionFor(admin: { id: string; email: string }) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: admin.id,
      status: 'approved',
      isReservationsAdmin: true,
      isAccountingAdmin: false,
      email: admin.email,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const userId of createdUserIds) {
    await testDb.delete(activityLog).where(eq(activityLog.actorUserId, userId))
    await testDb.delete(blockedDates).where(eq(blockedDates.createdBy, userId))
    // booking_rules is a shared singleton row (id=1) that outlives any one
    // test's fixtures; its updated_by FK must be cleared before the actor
    // user who last patched it can be deleted.
    await testDb
      .update(bookingRules)
      .set({ updatedBy: null })
      .where(eq(bookingRules.updatedBy, userId))
    await testIdentityDb.delete(users).where(eq(users.id, userId))
  }
  createdUserIds.length = 0
})

describe('admin routes', () => {
  it('approves a pending user', async () => {
    const admin = await makeAdmin('approve')
    mockSessionFor(admin)

    const pending = await testIdentityDb
      .insert(users)
      .values({ email: `admin-test-pending-${Date.now()}@example.com`, status: 'pending' })
      .returning()
      .then((r) => r[0])
    createdUserIds.push(pending.id)

    const request = new Request(`http://localhost/api/admin/users/${pending.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const response = await patchUser(request as never, {
      params: Promise.resolve({ id: pending.id }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user.status).toBe('approved')

    const activityRows = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.actorUserId, admin.id))
    expect(activityRows.some((a) => a.eventType === 'user_approved')).toBe(true)
  })

  it('creates a blocked date range', async () => {
    const admin = await makeAdmin('blockdate')
    mockSessionFor(admin)

    const request = new Request('http://localhost/api/admin/blocked-dates', {
      method: 'POST',
      body: JSON.stringify({
        startDate: '2027-11-01',
        endDate: '2027-11-05',
        reason: 'maintenance',
      }),
    })
    const response = await postBlockedDate(request as never)
    expect(response.status).toBe(201)

    const activityRows = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.actorUserId, admin.id))
    expect(activityRows.some((a) => a.eventType === 'blocked_date_created')).toBe(true)
  })

  it('updates booking rules and records before/after in activity_log', async () => {
    const admin = await makeAdmin('rules')
    mockSessionFor(admin)

    await testDb
      .insert(bookingRules)
      .values({
        id: 1,
        bookingHorizonDate: '2027-12-31',
        maxConsecutiveNights: 7,
        maxNightsPerUserPerYear: 14,
      })
      .onConflictDoUpdate({
        target: bookingRules.id,
        set: {
          bookingHorizonDate: '2027-12-31',
          maxConsecutiveNights: 7,
          maxNightsPerUserPerYear: 14,
        },
      })

    const request = new Request('http://localhost/api/admin/booking-rules', {
      method: 'PATCH',
      body: JSON.stringify({ maxConsecutiveNights: 10 }),
    })
    const response = await patchRules(request as never)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.bookingRules.maxConsecutiveNights).toBe(10)

    const activityRows = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.actorUserId, admin.id))
    const rulesEvent = activityRows.find((a) => a.eventType === 'booking_rules_updated')
    expect(rulesEvent).toBeDefined()
    expect(
      (rulesEvent!.metadata as { before: { maxConsecutiveNights: number } }).before
        .maxConsecutiveNights,
    ).toBe(7)
  })

  it('creates the booking rules row when none exists (bootstrap)', async () => {
    const admin = await makeAdmin('rules-bootstrap')
    mockSessionFor(admin)

    await testDb.delete(bookingRules)

    const request = new Request('http://localhost/api/admin/booking-rules', {
      method: 'PATCH',
      body: JSON.stringify({
        bookingHorizonDate: '2026-12-31',
        maxConsecutiveNights: 10,
        maxNightsPerUserPerYear: 20,
      }),
    })
    const response = await patchRules(request as never)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.bookingRules.maxConsecutiveNights).toBe(10)

    const [row] = await testDb.select().from(bookingRules).where(eq(bookingRules.id, 1))
    expect(row).toBeDefined()
    expect(row.maxNightsPerUserPerYear).toBe(20)
  })

  it('rejects a partial PATCH when no rules row exists yet', async () => {
    const admin = await makeAdmin('rules-partial-bootstrap')
    mockSessionFor(admin)

    await testDb.delete(bookingRules)

    const request = new Request('http://localhost/api/admin/booking-rules', {
      method: 'PATCH',
      body: JSON.stringify({ maxConsecutiveNights: 5 }),
    })
    const response = await patchRules(request as never)
    expect(response.status).toBe(400)
  })

  it('rejects an accounting-only admin trying to grant reservations-admin', async () => {
    const admin = await makeAdmin('accounting-only')
    // Override the mock to simulate an accounting-only admin (not a
    // reservations admin), proving the field-level permission check in the
    // PATCH handler — not just the outer requirePortalAdmin gate.
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: admin.id,
        status: 'approved',
        isReservationsAdmin: false,
        isAccountingAdmin: true,
        email: admin.email,
      },
      expires: '2099-01-01',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const target = await testIdentityDb
      .insert(users)
      .values({ email: `admin-test-target-${Date.now()}@example.com`, status: 'approved' })
      .returning()
      .then((r) => r[0])
    createdUserIds.push(target.id)

    const request = new Request(`http://localhost/api/admin/users/${target.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isReservationsAdmin: true }),
    })
    const response = await patchUser(request as never, {
      params: Promise.resolve({ id: target.id }),
    })
    expect(response.status).toBe(403)

    const [unchanged] = await testIdentityDb.select().from(users).where(eq(users.id, target.id))
    expect(unchanged.isReservationsAdmin).toBe(false)
  })
})
