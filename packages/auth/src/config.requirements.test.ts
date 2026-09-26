// Requirement coverage (requirements/accounts): the parts of CAP-001, CAP-003
// and CAP-004 that live in the shared Auth.js config factory. Same lazy,
// never-connecting identity db trick as config.callbacks.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'next-auth'
import type { AdapterUser } from '@auth/core/adapters'
import { createAuthConfig } from './config'
import { createIdentityDb } from './db'
import { canManagePortalContent, NO_ROLES, type UserRoles } from './roles'

const db = () => createIdentityDb('postgresql://user:pass@localhost:1/db')

const makeSession = (): Session =>
  ({ user: { email: 'ann@example.com' }, expires: '2030-01-01T00:00:00Z' }) as Session

const adapterUser = (over: Partial<AdapterUser> = {}) =>
  ({
    id: 'ann-1',
    email: 'ann@example.com',
    emailVerified: null,
    status: 'approved',
    ...over,
  }) as AdapterUser

type SessionCb = (p: { session: Session; user: AdapterUser }) => Promise<Session>

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('CAP-001 Sign in with Google', () => {
  it('CAP-001 · Google is the only way to sign in', () => {
    const config = createAuthConfig({ db: db(), basePath: '/api/auth' })
    expect(config.providers).toHaveLength(1)
    const [provider] = config.providers as { id?: string }[]
    expect(provider.id).toBe('google')
  })
})

describe('CAP-003 Access for unapproved accounts', () => {
  it('CAP-003 · Blocking takes effect immediately (status is re-read from the account on every request)', async () => {
    const config = createAuthConfig({ db: db(), basePath: '/api/auth' })
    // Database sessions: Auth.js loads the users row for every request and
    // hands it to the session callback, so no session carries a stale status.
    expect(config.session?.strategy).toBe('database')

    const cb = config.callbacks!.session! as SessionCb
    const before = await cb({ session: makeSession(), user: adapterUser({ status: 'approved' }) })
    expect(before.user.status).toBe('approved')

    // An admin blocks Ann; her very next request sees the blocked row.
    const after = await cb({ session: makeSession(), user: adapterUser({ status: 'blocked' }) })
    expect(after.user.status).toBe('blocked')
  })

  it("CAP-003 · The site owner's own account is always approved (even when blocked)", async () => {
    const cb = createAuthConfig({ db: db(), basePath: '/api/auth' }).callbacks!
      .session! as SessionCb
    vi.stubEnv('SITE_OWNER_EMAIL', 'owner@example.com')

    const result = await cb({
      session: makeSession(),
      user: adapterUser({ email: 'owner@example.com', status: 'blocked' }),
    })

    expect(result.user.status).toBe('approved')
    expect(result.user.roles.siteOwner).toBe(true)
  })
})

describe('CAP-004 Admin roles', () => {
  it('CAP-004 · Role changes take effect on my next page', async () => {
    // The roles reader is consulted on every request, so a grant made between
    // two page loads shows up on the second one without signing in again.
    let stored: UserRoles = NO_ROLES
    const getUserRoles = vi.fn(async () => stored)
    const cb = createAuthConfig({ db: db(), basePath: '/api/auth', getUserRoles }).callbacks!
      .session! as SessionCb

    const first = await cb({ session: makeSession(), user: adapterUser() })
    expect(canManagePortalContent(first.user.roles)).toBe(false)

    stored = { siteOwner: false, siteManager: true, accountingManager: false }

    const next = await cb({ session: makeSession(), user: adapterUser() })
    expect(next.user.roles.siteManager).toBe(true)
    expect(canManagePortalContent(next.user.roles)).toBe(true)
    expect(getUserRoles).toHaveBeenCalledTimes(2)
  })
})
