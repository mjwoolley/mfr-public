// Branches the happy-path suites (portalContent.test.ts,
// userManagement.test.ts) don't reach: zod validation failures, all three
// role arms, the settings singleton's already-seeded read path, attendee
// name derivation, and users without a roles row.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'

// Same mock trio as userManagement.test.ts (see comments there).
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { auth } from '@/lib/auth'
import { setUserStatus, setUserRole } from '@/app/admin/users/actions'
import {
  saveSchedule,
  saveLinks,
  setAlbumUrl,
  removeAlbum,
  updateEvent,
  removeEvent,
} from '@/app/admin/actions'
import { toggleMeal } from '@/app/meals/actions'
import { getPortalSettings, getAttendees } from '@/lib/portal'
import { listUsersWithRoles } from '@/lib/users'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { portalUserRoles } from '@/lib/db/schema'

const ownerSession = (id: string) => ({
  user: {
    id,
    status: 'approved',
    roles: { siteOwner: true, siteManager: false, accountingManager: false },
  },
  expires: '2099-01-01',
})

const memberSession = (id: string) => ({
  user: {
    id,
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
  },
  expires: '2099-01-01',
})

const createdUserIds: string[] = []

async function makeIdentityUser(over: { name?: string | null } = {}) {
  const [row] = await identityDb
    .insert(users)
    .values({
      email: `portal-branches-${randomUUID()}@example.com`,
      name: over.name === undefined ? 'Branch Tester' : over.name,
      status: 'approved',
    })
    .returning()
  createdUserIds.push(row.id)
  return row
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  for (const id of createdUserIds) {
    await portalDb.delete(portalUserRoles).where(eq(portalUserRoles.identityUserId, id))
    await identityDb.delete(users).where(eq(users.id, id))
  }
  createdUserIds.length = 0
})

describe('zod validation failures return friendly errors', () => {
  it('setUserStatus rejects a non-uuid user id', async () => {
    const owner = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    const result = await setUserStatus({ userId: 'not-a-uuid', status: 'approved' })
    expect('error' in result! && result.error).toBeTruthy()
  })

  it('setUserRole rejects an unknown role', async () => {
    const owner = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await setUserRole({ userId: owner.id, role: 'superuser' as any, value: true })
    expect('error' in result! && result.error).toBeTruthy()
  })

  it('toggleMeal rejects an out-of-range day index', async () => {
    const member = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(memberSession(member.id) as never)

    const zero = await toggleMeal({ dayIndex: 0, meal: 'L' })
    expect('error' in zero! && zero.error).toBeTruthy()
    const high = await toggleMeal({ dayIndex: 22, meal: 'D' })
    expect('error' in high! && high.error).toBeTruthy()
  })

  it('saveSchedule rejects an out-of-range year', async () => {
    const owner = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    const result = await saveSchedule({ reunionYear: 1999 })
    expect('error' in result! && result.error).toBeTruthy()
  })

  it('saveLinks rejects a malformed payload', async () => {
    const owner = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    const result = await saveLinks({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      highlightsUrl: 42 as any,
      driveUrl: '',
      venmoUrl: '',
      chatUrl: '',
    })
    expect('error' in result! && result.error).toBeTruthy()
  })
})

describe('album/event invalid-id branches', () => {
  it('setAlbumUrl / removeAlbum / updateEvent / removeEvent reject non-uuid ids', async () => {
    const owner = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    const badAlbumUrl = await setAlbumUrl({ id: 'nope', url: 'https://x' })
    expect('error' in badAlbumUrl! && badAlbumUrl.error).toBeTruthy()

    expect(await removeAlbum({ id: 'nope' })).toEqual({ error: 'Invalid album' })

    const badEvent = await updateEvent({ id: 'nope' })
    expect('error' in badEvent! && badEvent.error).toBeTruthy()

    expect(await removeEvent({ id: 'nope' })).toEqual({ error: 'Invalid event' })
  })
})

describe('setUserRole covers every role arm', () => {
  it('grants and revokes siteManager and accountingManager', async () => {
    const owner = await makeIdentityUser()
    const target = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    await setUserRole({ userId: target.id, role: 'siteManager', value: true })
    await setUserRole({ userId: target.id, role: 'accountingManager', value: true })

    let [row] = await portalDb
      .select()
      .from(portalUserRoles)
      .where(eq(portalUserRoles.identityUserId, target.id))
    expect(row.isSiteManager).toBe(true)
    expect(row.isAccountingManager).toBe(true)
    expect(row.isSiteOwner).toBe(false)

    await setUserRole({ userId: target.id, role: 'siteManager', value: false })
    ;[row] = await portalDb
      .select()
      .from(portalUserRoles)
      .where(eq(portalUserRoles.identityUserId, target.id))
    expect(row.isSiteManager).toBe(false)
    expect(row.isAccountingManager).toBe(true)
  })

  it('grants siteOwner to someone else (only self-removal is guarded)', async () => {
    const owner = await makeIdentityUser()
    const target = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    const result = await setUserRole({ userId: target.id, role: 'siteOwner', value: true })
    expect(result).toEqual({ ok: true })

    const [row] = await portalDb
      .select()
      .from(portalUserRoles)
      .where(eq(portalUserRoles.identityUserId, target.id))
    expect(row.isSiteOwner).toBe(true)
  })
})

describe('settings singleton', () => {
  it('second read takes the already-seeded path (no insert row returned)', async () => {
    const first = await getPortalSettings()
    const second = await getPortalSettings()

    expect(first.id).toBe('singleton')
    expect(second.id).toBe('singleton')
  })

  it('saveSchedule stores empty date strings as null', async () => {
    const owner = await makeIdentityUser()
    vi.mocked(auth).mockResolvedValue(ownerSession(owner.id) as never)

    const result = await saveSchedule({ reunionYear: 2050, reunionStart: '', reunionEnd: '' })
    expect(result).toEqual({ ok: true })

    const settings = await getPortalSettings()
    expect(settings.reunionYear).toBe(2050)
    expect(settings.reunionStart).toBeNull()
    expect(settings.reunionEnd).toBeNull()
  })
})

describe('attendee name derivation', () => {
  it('derives names from email for name-less users and splits multi-word names', async () => {
    const named = await makeIdentityUser({ name: 'Ada Marie Lovelace' })
    const nameless = await makeIdentityUser({ name: null })

    const attendees = await getAttendees()
    const adaRow = attendees.find((a) => a.id === named.id)
    expect(adaRow).toMatchObject({ firstName: 'Ada', lastName: 'Marie Lovelace' })

    const namelessRow = attendees.find((a) => a.id === nameless.id)
    // display name falls back to the email local part; single word → no last name
    expect(namelessRow?.firstName).toMatch(/^portal-branches-/)
    expect(namelessRow?.lastName).toBe('')
  })
})

describe('listUsersWithRoles', () => {
  it('reports all-false roles for a user with no roles row', async () => {
    const plain = await makeIdentityUser()

    const list = await listUsersWithRoles()
    const row = list.find((u) => u.id === plain.id)

    expect(row).toMatchObject({
      siteOwner: false,
      siteManager: false,
      accountingManager: false,
      status: 'approved',
    })
  })
})
