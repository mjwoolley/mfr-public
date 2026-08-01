import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { getLinkCandidates } from '@/lib/accounting/linkCandidates'

const createdShareholderIds: string[] = []
const createdUserIds: string[] = []

async function makeUser(name: string, status: 'approved' | 'pending' | 'blocked' = 'approved') {
  const [row] = await testIdentityDb
    .insert(users)
    .values({ email: `${name}-${Date.now()}-${Math.random()}@example.com`, name, status })
    .returning()
  createdUserIds.push(row.id)
  return row
}

async function makeShareholder(name: string, userId?: string) {
  const row = await testDb.shareholder.create({
    data: { name: `${name} ${Date.now()}-${Math.random()}`, userId: userId ?? null },
  })
  createdShareholderIds.push(row.id)
  return row
}

afterEach(async () => {
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
  for (const id of createdUserIds) {
    await testIdentityDb.delete(users).where(eq(users.id, id))
  }
  createdUserIds.length = 0
})

describe('getLinkCandidates', () => {
  // Shareholder.userId is unique, so offering a taken login would produce a
  // link that can only ever fail.
  it('leaves out a login already attached to a shareholder', async () => {
    const taken = await makeUser('Taken Login')
    const free = await makeUser('Free Login')
    await makeShareholder('Has A Login', taken.id)

    const { unlinked } = await getLinkCandidates()
    const ids = unlinked.map((u) => u.id)

    expect(ids).toContain(free.id)
    expect(ids).not.toContain(taken.id)
  })

  it('resolves a linked login by id, for naming it on the list', async () => {
    const linked = await makeUser('Linked Login')
    await makeShareholder('Linked Holder', linked.id)

    const { byId } = await getLinkCandidates()

    expect(byId.get(linked.id)).toEqual({
      id: linked.id,
      email: linked.email,
      name: 'Linked Login',
    })
  })

  // A pending or blocked account can't use the portal, so linking one would
  // create a reference to somebody who can never sign in.
  it('offers only approved logins', async () => {
    const approved = await makeUser('Approved Person')
    const pending = await makeUser('Pending Person', 'pending')
    const blocked = await makeUser('Blocked Person', 'blocked')

    const { unlinked, byId } = await getLinkCandidates()
    const ids = unlinked.map((u) => u.id)

    expect(ids).toContain(approved.id)
    expect(ids).not.toContain(pending.id)
    expect(ids).not.toContain(blocked.id)
    expect(byId.has(pending.id)).toBe(false)
  })

  it('counts a shareholder with no login as taking nothing', async () => {
    const free = await makeUser('Still Free')
    await makeShareholder('No Login Holder')

    const { unlinked } = await getLinkCandidates()

    expect(unlinked.map((u) => u.id)).toContain(free.id)
  })
})
