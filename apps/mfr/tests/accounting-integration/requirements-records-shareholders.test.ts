import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { users } from '@mfr/auth'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'

// Requirements coverage for CAP-046 (shareholder-records.md) and CAP-047
// (link-logins-to-shareholders.md) against the real test DB. Same mocking
// rationale as shareholders.test.ts: auth is a session stub, revalidatePath
// needs a request store, and notification emails must not hit SES.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { auth } from '@/lib/auth'
import {
  createShareholder,
  updateShareholder,
  setShareholderActive,
  linkShareholderToUser,
  unlinkShareholder,
} from '@/actions/accounting/shareholders'
import { createTransfer } from '@/actions/accounting/transfers'
import { createAdjustment } from '@/actions/accounting/adjustments'
import AdminShareholdersPage from '@/app/accounting/admin/shareholders/page'
import AdminTransactionsPage from '@/app/accounting/admin/transactions/page'

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
    id: 'member-1',
    status: 'approved',
    roles: { siteOwner: false, siteManager: false, accountingManager: false },
    shareholderId: null,
    email: 'member@example.com',
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

/** Awaits a server action expected to end in redirect(), returning where it went. */
async function redirectTarget(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => {
      throw new Error('expected a redirect')
    },
    (e: { digest?: string }) => e,
  )
  // digest = NEXT_REDIRECT;<type>;<url>;<status>;
  return String(err.digest).split(';')[2]
}

const UNAUTHORIZED = '/accounting/unauthorized'
const LIST = '/accounting/admin/shareholders'

/** A per-test unique token, so names and emails never collide with other suites. */
function uniq() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const createdShareholderIds: string[] = []
const createdUserIds: string[] = []
const createdTransactionIds: string[] = []

afterEach(async () => {
  vi.mocked(auth).mockReset()
  // Transactions first: LedgerEntry cascades from Transaction, not Shareholder.
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {})
  }
  createdTransactionIds.length = 0
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  createdShareholderIds.length = 0
  for (const id of createdUserIds) {
    await testIdentityDb.delete(users).where(eq(users.id, id))
  }
  createdUserIds.length = 0
})

async function makeShareholder(data: {
  name: string
  email?: string | null
  active?: boolean
  userId?: string | null
}) {
  const row = await testDb.shareholder.create({ data: { email: null, ...data } })
  createdShareholderIds.push(row.id)
  return row
}

async function makeLogin(email: string, name = 'Login Person') {
  const [row] = await testIdentityDb
    .insert(users)
    .values({ email, name, status: 'approved' })
    .returning()
  createdUserIds.push(row.id)
  return row
}

/** Tracks shareholders the create action made (it returns nothing but a redirect). */
async function trackByName(name: string) {
  const rows = await testDb.shareholder.findMany({ where: { name } })
  for (const r of rows) createdShareholderIds.push(r.id)
  return rows
}

describe('CAP-046 Shareholder records — real DB', () => {
  it('CAP-046 · Two shareholders may share a name', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const name = `Ann Miller ${uniq()}`

    // Success ends in redirect() back to the list.
    expect(await redirectTarget(createShareholder(undefined, fd({ name, email: '' })))).toBe(LIST)
    expect(await redirectTarget(createShareholder(undefined, fd({ name, email: '' })))).toBe(LIST)

    const rows = await trackByName(name)
    expect(rows).toHaveLength(2)
    expect(rows[0].id).not.toBe(rows[1].id)
  })

  it('CAP-046 · A name is required — the create path refuses a blank name', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const email = `blank-name-${uniq()}@example.com`

    const result = await createShareholder(undefined, fd({ name: '   ', email }))

    expect(result).toEqual({ error: 'Name is required' })
    expect(await testDb.shareholder.findFirst({ where: { email } })).toBeNull()
  })

  it('CAP-046 · Emails are stored in lower case', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const token = uniq()
    const name = `Lowercase Holder ${token}`

    expect(
      await redirectTarget(
        createShareholder(undefined, fd({ name, email: `Ann.Miller.${token}@Family.org` })),
      ),
    ).toBe(LIST)

    const [row] = await trackByName(name)
    expect(row.email).toBe(`ann.miller.${token}@family.org`)
  })

  it("CAP-046 · Two shareholders can't have the same email — the check ignores case", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const token = uniq()
    await makeShareholder({ name: `Ann ${token}`, email: `ann-${token}@family.org` })
    const name = `Second Ann ${token}`

    const result = await createShareholder(
      undefined,
      fd({ name, email: `ANN-${token}@family.org` }),
    )

    expect(result).toEqual({ error: 'A shareholder with that email already exists' })
    expect(await testDb.shareholder.findFirst({ where: { name } })).toBeNull()
  })

  it('CAP-046 · The shareholder list — listed alphabetically by name', async () => {
    const token = uniq()
    // Inserted out of order.
    await makeShareholder({ name: `ReqList ${token} Zed` })
    await makeShareholder({ name: `ReqList ${token} Amy` })
    await makeShareholder({ name: `ReqList ${token} Mia` })

    const html = renderToStaticMarkup(await AdminShareholdersPage())

    const mine = [...html.matchAll(/<span class="block font-semibold">(ReqList [^<]+)/g)]
      .map((m) => m[1])
      .filter((n) => n.includes(token))
    expect(mine).toEqual([`ReqList ${token} Amy`, `ReqList ${token} Mia`, `ReqList ${token} Zed`])
  })

  describe("CAP-046 · Inactive shareholders can't take part in new share transactions", () => {
    it("CAP-046 · Inactive shareholders can't take part — a transfer from an inactive shareholder is refused and nothing is recorded", async () => {
      vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
      const token = uniq()
      const inactive = await makeShareholder({ name: `Inactive From ${token}`, active: false })
      const active = await makeShareholder({ name: `Active To ${token}` })

      const result = await createTransfer(
        undefined,
        fd({
          fromShareholderId: inactive.id,
          toShareholderId: active.id,
          amount: '100',
          description: `Transfer ${token}`,
        }),
      )

      expect(result).toEqual({ error: 'Shareholder not found or inactive' })
      expect(await testDb.ledgerEntry.findMany({ where: { shareholderId: inactive.id } })).toEqual(
        [],
      )
      expect(await testDb.ledgerEntry.findMany({ where: { shareholderId: active.id } })).toEqual([])
    })

    it("CAP-046 · Inactive shareholders can't take part — a transfer to an inactive shareholder is refused and nothing is recorded", async () => {
      vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
      const token = uniq()
      const active = await makeShareholder({ name: `Active From ${token}` })
      const inactive = await makeShareholder({ name: `Inactive To ${token}`, active: false })

      const result = await createTransfer(
        undefined,
        fd({
          fromShareholderId: active.id,
          toShareholderId: inactive.id,
          amount: '100',
          description: `Transfer ${token}`,
        }),
      )

      expect(result).toEqual({ error: 'Shareholder not found or inactive' })
      expect(await testDb.ledgerEntry.findMany({ where: { shareholderId: active.id } })).toEqual([])
      expect(await testDb.ledgerEntry.findMany({ where: { shareholderId: inactive.id } })).toEqual(
        [],
      )
    })

    it("CAP-046 · Inactive shareholders can't take part — an adjustment for an inactive shareholder is refused and nothing is recorded", async () => {
      vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
      const inactive = await makeShareholder({ name: `Inactive Adj ${uniq()}`, active: false })

      const result = await createAdjustment(
        undefined,
        fd({ shareholderId: inactive.id, amount: '50', description: 'Adjustment' }),
      )

      expect(result).toEqual({ error: 'Shareholder not found or inactive' })
      expect(await testDb.ledgerEntry.findMany({ where: { shareholderId: inactive.id } })).toEqual(
        [],
      )
    })

    it("CAP-046 · Inactive shareholders can't take part — the entry forms don't offer an inactive shareholder", async () => {
      const inactive = await makeShareholder({ name: `Not Offered ${uniq()}`, active: false })
      const active = await makeShareholder({ name: `Offered ${uniq()}` })

      const element = await AdminTransactionsPage({ searchParams: Promise.resolve({}) })
      const offered = (element.props as { shareholders: { id: string; name: string }[] })
        .shareholders

      expect(offered.some((s) => s.id === inactive.id)).toBe(false)
      expect(offered).toContainEqual({ id: active.id, name: active.name })
    })
  })

  it('CAP-046 · Admin reactivates a shareholder — she can be chosen for new share transactions again', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const ann = await makeShareholder({ name: `Reactivated ${uniq()}`, active: false })

    await setShareholderActive(ann.id, true)

    const element = await AdminTransactionsPage({ searchParams: Promise.resolve({}) })
    const offered = (element.props as { shareholders: { id: string; name: string }[] }).shareholders
    expect(offered).toContainEqual({ id: ann.id, name: ann.name })

    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: ann.id, amount: '10', description: 'Welcome back' }),
    )
    expect(result).toEqual({ success: true })
    const entries = await testDb.ledgerEntry.findMany({ where: { shareholderId: ann.id } })
    for (const e of entries) createdTransactionIds.push(e.transactionId)
    expect(entries.map((e) => String(e.shares))).toEqual(['10'])
  })

  describe('CAP-046 · Only accounting admins can change shareholder records', () => {
    it('CAP-046 · Only accounting admins — a non-admin cannot add a shareholder', async () => {
      vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
      const name = `Refused Add ${uniq()}`

      expect(await redirectTarget(createShareholder(undefined, fd({ name, email: '' })))).toBe(
        UNAUTHORIZED,
      )

      expect(await testDb.shareholder.findFirst({ where: { name } })).toBeNull()
    })

    it('CAP-046 · Only accounting admins — a non-admin cannot edit a shareholder', async () => {
      vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
      const token = uniq()
      const ann = await makeShareholder({ name: `Ann ${token}`, email: `ann-${token}@family.org` })

      expect(
        await redirectTarget(
          updateShareholder(
            undefined,
            fd({ shareholderId: ann.id, name: 'Hijacked', email: `x-${token}@family.org` }),
          ),
        ),
      ).toBe(UNAUTHORIZED)

      const after = await testDb.shareholder.findUnique({ where: { id: ann.id } })
      expect(after).toMatchObject({ name: `Ann ${token}`, email: `ann-${token}@family.org` })
    })

    it('CAP-046 · Only accounting admins — a non-admin cannot deactivate a shareholder', async () => {
      vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
      const ann = await makeShareholder({ name: `Stays Active ${uniq()}` })

      expect(await redirectTarget(setShareholderActive(ann.id, false))).toBe(UNAUTHORIZED)

      expect((await testDb.shareholder.findUnique({ where: { id: ann.id } }))?.active).toBe(true)
    })
  })
})

describe('CAP-047 Link logins to shareholders — real DB', () => {
  it('CAP-047 · Editing a shareholder keeps a link made by hand — changing the name', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const token = uniq()
    const michele = await makeLogin(`michele-${token}@family.org`, 'Michele Anderegg')
    const household = await makeShareholder({
      name: `John and Michele Anderegg ${token}`,
      email: `john-${token}@family.org`,
      userId: michele.id,
    })

    const result = await updateShareholder(
      undefined,
      fd({
        shareholderId: household.id,
        name: `The Anderegg Household ${token}`,
        email: `john-${token}@family.org`,
      }),
    )

    expect(result).toBeUndefined()
    const after = await testDb.shareholder.findUnique({ where: { id: household.id } })
    expect(after).toMatchObject({ name: `The Anderegg Household ${token}`, userId: michele.id })
  })

  it('CAP-047 · Editing a shareholder keeps a link made by hand — changing the email to one no login uses', async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION)
    const token = uniq()
    const michele = await makeLogin(`michele-${token}@family.org`, 'Michele Anderegg')
    const household = await makeShareholder({
      name: `John and Michele Anderegg ${token}`,
      email: `john-${token}@family.org`,
      userId: michele.id,
    })

    const result = await updateShareholder(
      undefined,
      fd({
        shareholderId: household.id,
        name: household.name,
        email: `nobody-${token}@family.org`,
      }),
    )

    expect(result).toBeUndefined()
    const after = await testDb.shareholder.findUnique({ where: { id: household.id } })
    expect(after).toMatchObject({ email: `nobody-${token}@family.org`, userId: michele.id })
  })

  describe('CAP-047 · Only accounting admins can link or unlink', () => {
    it('CAP-047 · Only accounting admins — a non-admin cannot link a login', async () => {
      vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
      const token = uniq()
      const login = await makeLogin(`link-${token}@family.org`)
      const holder = await makeShareholder({ name: `Unlinked ${token}` })

      expect(await redirectTarget(linkShareholderToUser(holder.id, login.id))).toBe(UNAUTHORIZED)

      const after = await testDb.shareholder.findUnique({ where: { id: holder.id } })
      expect(after).toMatchObject({ userId: null, email: null })
    })

    it('CAP-047 · Only accounting admins — a non-admin cannot unlink a login', async () => {
      vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION)
      const token = uniq()
      const login = await makeLogin(`unlink-${token}@family.org`)
      const holder = await makeShareholder({ name: `Linked ${token}`, userId: login.id })

      expect(await redirectTarget(unlinkShareholder(holder.id))).toBe(UNAUTHORIZED)

      expect((await testDb.shareholder.findUnique({ where: { id: holder.id } }))?.userId).toBe(
        login.id,
      )
    })
  })
})
