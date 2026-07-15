import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { reservations } from '../../lib/db/schema'
import { users } from '@mfr/auth'

// See tests/integration/reservations.test.ts for why `auth` is mocked here.
vi.mock('../../lib/auth/config', () => ({ auth: vi.fn() }))

import { auth } from '../../lib/auth/config'
import { GET } from '../../app/reservations/api/history/route'

const createdUserIds: string[] = []

// GET /api/history scopes results to the current calendar year by startDate,
// so seed dates must be derived from today's date to stay in range.
const currentYear = new Date().getUTCFullYear()

function mockSessionFor(user: { id: string; email?: string | null }) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      status: 'approved',
      roles: { siteOwner: false, siteManager: false, accountingManager: false },
      email: user.email ?? undefined,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

async function makeUser(suffix: string) {
  const [user] = await testIdentityDb
    .insert(users)
    .values({
      email: `history-test-${suffix}-${Date.now()}-${Math.random()}@example.com`,
      status: 'approved',
    })
    .returning()
  createdUserIds.push(user.id)
  return user
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const userId of createdUserIds) {
    await testDb.delete(reservations).where(eq(reservations.userId, userId))
    await testIdentityDb.delete(users).where(eq(users.id, userId))
  }
  createdUserIds.length = 0
})

describe('GET /api/history', () => {
  it('excludes cancelled reservations from the returned list', async () => {
    const user = await makeUser('a')
    mockSessionFor(user)

    const [confirmed] = await testDb
      .insert(reservations)
      .values({
        userId: user.id,
        startDate: `${currentYear}-07-01`,
        endDate: `${currentYear}-07-05`,
        status: 'confirmed',
      })
      .returning()
    const [cancelled] = await testDb
      .insert(reservations)
      .values({
        userId: user.id,
        startDate: `${currentYear}-08-01`,
        endDate: `${currentYear}-08-05`,
        status: 'cancelled',
      })
      .returning()

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    const ids = body.reservations.map((r: { id: string }) => r.id)
    expect(ids).toContain(confirmed.id)
    expect(ids).not.toContain(cancelled.id)
  })

  it('returns reservations across all users, not just the requesting user', async () => {
    const me = await makeUser('b')
    const other = await makeUser('c')
    mockSessionFor(me)

    const [mine] = await testDb
      .insert(reservations)
      .values({
        userId: me.id,
        startDate: `${currentYear}-09-01`,
        endDate: `${currentYear}-09-05`,
        status: 'confirmed',
      })
      .returning()
    const [theirs] = await testDb
      .insert(reservations)
      .values({
        userId: other.id,
        startDate: `${currentYear}-09-10`,
        endDate: `${currentYear}-09-12`,
        status: 'confirmed',
      })
      .returning()

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    const ids = body.reservations.map((r: { id: string }) => r.id)
    expect(ids).toContain(mine.id)
    expect(ids).toContain(theirs.id)
  })

  it('excludes reservations whose start date falls outside the current calendar year', async () => {
    const user = await makeUser('d')
    mockSessionFor(user)

    const [thisYear] = await testDb
      .insert(reservations)
      .values({
        userId: user.id,
        startDate: `${currentYear}-06-01`,
        endDate: `${currentYear}-06-05`,
        status: 'confirmed',
      })
      .returning()
    const [lastYear] = await testDb
      .insert(reservations)
      .values({
        userId: user.id,
        startDate: `${currentYear - 1}-06-01`,
        endDate: `${currentYear - 1}-06-05`,
        status: 'confirmed',
      })
      .returning()
    const [nextYear] = await testDb
      .insert(reservations)
      .values({
        userId: user.id,
        startDate: `${currentYear + 1}-06-01`,
        endDate: `${currentYear + 1}-06-05`,
        status: 'confirmed',
      })
      .returning()

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    const ids = body.reservations.map((r: { id: string }) => r.id)
    expect(ids).toContain(thisYear.id)
    expect(ids).not.toContain(lastYear.id)
    expect(ids).not.toContain(nextYear.id)
  })

  it('rejects with 401 when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const response = await GET()
    expect(response.status).toBe(401)
  })
})
