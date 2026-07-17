// The extendSession hook in @/lib/auth — accounting's one app-specific
// session field (the linked Shareholder id) plus the once-only email link
// and its 23505 race handling. The module wires NextAuth at load time, so
// next-auth and the DB singletons are mocked and the hook is captured from
// the createAuthConfig options.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'next-auth'
import { eq } from 'drizzle-orm'
import { shareholder } from '@/lib/db/schema'

const captured: { extendSession?: (session: Session, user: unknown) => Promise<void> } = {}

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}))

vi.mock('@mfr/auth', () => ({
  createAuthConfig: vi.fn((opts: { extendSession: typeof captured.extendSession }) => {
    captured.extendSession = opts.extendSession
    return {}
  }),
  createRolesReaderFromEnv: vi.fn(() => async () => ({
    siteOwner: false,
    siteManager: false,
    accountingManager: false,
  })),
}))

vi.mock('@/lib/identityDb', () => ({ identityDb: {} }))

// The Drizzle client: the hook reads via db.query.shareholder.findFirst and
// writes via the db.update(...).set(...).where(...) builder chain. The awaited
// value is whatever the terminal .where() resolves/rejects with.
const findFirst = vi.fn()
const updateWhere = vi.fn()
const updateSet = vi.fn(() => ({ where: updateWhere }))
const update = vi.fn(() => ({ set: updateSet }))
vi.mock('@/lib/db/client', () => ({
  db: {
    query: { shareholder: { findFirst } },
    update,
  },
}))

// Importing the module under test runs NextAuth(createAuthConfig(...)) with
// the mocks above and fills `captured`.
await import('@/lib/auth')

function session(): Session {
  return { user: {} } as Session
}

// A Postgres unique_violation, as postgres-js surfaces it — code "23505".
const duplicate = () =>
  Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  })

beforeEach(() => {
  findFirst.mockReset()
  updateWhere.mockReset()
  update.mockClear()
  updateSet.mockClear()
})

describe('extendSession', () => {
  it('was captured from the shared config factory', () => {
    expect(captured.extendSession).toBeTypeOf('function')
  })

  it('attaches null when the user has no email', async () => {
    const s = session()
    await captured.extendSession!(s, { id: 'u1', email: null })

    expect(s.user.shareholderId).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('attaches null when no shareholder matches the email', async () => {
    findFirst.mockResolvedValue(null)
    const s = session()
    await captured.extendSession!(s, { id: 'u1', email: 'nobody@example.com' })

    expect(s.user.shareholderId).toBeNull()
  })

  it('lowercases the email for the lookup', async () => {
    findFirst.mockResolvedValue(null)
    await captured.extendSession!(session(), { id: 'u1', email: 'Mixed@Example.COM' })

    expect(findFirst).toHaveBeenCalledWith({
      where: eq(shareholder.email, 'mixed@example.com'),
    })
  })

  it('attaches the id without relinking when the shareholder is already linked to this user', async () => {
    findFirst.mockResolvedValue({ id: 'sh1', userId: 'u1' })
    const s = session()
    await captured.extendSession!(s, { id: 'u1', email: 'a@b.c' })

    expect(s.user.shareholderId).toBe('sh1')
    expect(update).not.toHaveBeenCalled()
  })

  it('links the shareholder to this user on first sign-in', async () => {
    findFirst.mockResolvedValue({ id: 'sh1', userId: null })
    updateWhere.mockResolvedValue({})
    const s = session()
    await captured.extendSession!(s, { id: 'u1', email: 'a@b.c' })

    expect(update).toHaveBeenCalledWith(shareholder)
    expect(updateSet).toHaveBeenCalledWith({ userId: 'u1' })
    expect(updateWhere).toHaveBeenCalledWith(eq(shareholder.id, 'sh1'))
    expect(s.user.shareholderId).toBe('sh1')
  })

  it('swallows a lost 23505 relink race and still attaches the id', async () => {
    findFirst.mockResolvedValue({ id: 'sh1', userId: 'other-user' })
    updateWhere.mockRejectedValue(duplicate())
    const s = session()

    await captured.extendSession!(s, { id: 'u1', email: 'a@b.c' })
    expect(s.user.shareholderId).toBe('sh1')
  })

  it('rethrows non-23505 errors from the relink', async () => {
    findFirst.mockResolvedValue({ id: 'sh1', userId: 'other-user' })
    updateWhere.mockRejectedValue(new Error('connection lost'))

    await expect(captured.extendSession!(session(), { id: 'u1', email: 'a@b.c' })).rejects.toThrow(
      'connection lost',
    )
  })
})
