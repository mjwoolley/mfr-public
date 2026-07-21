// Behavior of the config factory's callbacks/events/cookie wiring.
// DrizzleAdapter type-checks its db argument, so the base is a real (lazy,
// never-connecting) drizzle instance — same trick as config.test.ts — with
// `update` spied out so the linkAccount event can be observed without a
// query ever executing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'next-auth'
import type { AdapterUser } from '@auth/core/adapters'
import { createAuthConfig } from './config'
import { NO_ROLES } from './roles'
import { createIdentityDb } from './db'

function fakeDb() {
  const db = createIdentityDb('postgresql://user:pass@localhost:1/db')
  const where = vi.fn(async () => {})
  const set = vi.fn(() => ({ where }))
  const update = vi
    .spyOn(db, 'update')
    .mockImplementation(() => ({ set }) as unknown as ReturnType<typeof db.update>)
  return { db, update, set, where }
}

function makeSession(): Session {
  return { user: { email: 'a@b.c' }, expires: '2030-01-01T00:00:00Z' } as Session
}

const adapterUser = (over: Partial<AdapterUser> = {}) =>
  ({
    id: 'user-1',
    email: 'a@b.c',
    emailVerified: null,
    status: 'approved',
    ...over,
  }) as AdapterUser

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('redirect callback', () => {
  const redirect = (opts: { cookieDomain?: string } = {}) => {
    const config = createAuthConfig({ db: fakeDb().db, basePath: '/api/auth', ...opts })
    return config.callbacks!.redirect! as (p: { url: string; baseUrl: string }) => Promise<string>
  }
  const baseUrl = 'https://accounting.millerfamilyreunions.org'

  it('resolves relative urls against the app origin', async () => {
    expect(await redirect()({ url: '/accounting/dashboard', baseUrl })).toBe(
      `${baseUrl}/accounting/dashboard`,
    )
  })

  it('keeps same-origin absolute urls', async () => {
    expect(await redirect()({ url: `${baseUrl}/accounting`, baseUrl })).toBe(
      `${baseUrl}/accounting`,
    )
  })

  it('allows same-hostname urls across ports (local dev)', async () => {
    expect(
      await redirect()({
        url: 'http://localhost:3000/reservations',
        baseUrl: 'http://localhost:3002',
      }),
    ).toBe('http://localhost:3000/reservations')
  })

  it('allows sibling subdomains of the cookie domain', async () => {
    expect(
      await redirect({ cookieDomain: '.millerfamilyreunions.org' })({
        url: 'https://reservations.millerfamilyreunions.org/reservations',
        baseUrl,
      }),
    ).toBe('https://reservations.millerfamilyreunions.org/reservations')
  })

  it('allows the bare registrable domain and normalizes a dotless cookieDomain', async () => {
    expect(
      await redirect({ cookieDomain: 'millerfamilyreunions.org' })({
        url: 'https://millerfamilyreunions.org/sign-in',
        baseUrl,
      }),
    ).toBe('https://millerfamilyreunions.org/sign-in')
  })

  it('falls back to the app origin for foreign hosts', async () => {
    expect(
      await redirect({ cookieDomain: '.millerfamilyreunions.org' })({
        url: 'https://evil.example.com/phish',
        baseUrl,
      }),
    ).toBe(baseUrl)
  })

  it('falls back to the app origin without a cookieDomain', async () => {
    expect(await redirect()({ url: 'https://millerfamilyreunions.org/sign-in', baseUrl })).toBe(
      baseUrl,
    )
  })

  it('falls back to the app origin on malformed urls', async () => {
    expect(await redirect()({ url: 'http://[not-a-url', baseUrl })).toBe(baseUrl)
  })
})

describe('session callback', () => {
  const sessionCb = (opts: Parameters<typeof createAuthConfig>[0]) =>
    createAuthConfig(opts).callbacks!.session! as (p: {
      session: Session
      user: AdapterUser
    }) => Promise<Session>

  it('attaches id, status, and NO_ROLES when no roles reader is wired', async () => {
    const result = await sessionCb({ db: fakeDb().db, basePath: '/api/auth' })({
      session: makeSession(),
      user: adapterUser(),
    })

    expect(result.user.id).toBe('user-1')
    expect(result.user.status).toBe('approved')
    expect(result.user.roles).toEqual(NO_ROLES)
  })

  it('resolves roles through getUserRoles and runs extendSession last', async () => {
    const roles = { siteOwner: true, siteManager: false, accountingManager: false }
    const getUserRoles = vi.fn(async () => roles)
    const extendSession = vi.fn(async (session: Session) => {
      // roles must already be attached when the app extension runs
      expect(session.user.roles).toEqual(roles)
    })

    const result = await sessionCb({
      db: fakeDb().db,
      basePath: '/api/auth',
      getUserRoles,
      extendSession,
    })({ session: makeSession(), user: adapterUser() })

    expect(getUserRoles).toHaveBeenCalledWith('user-1')
    expect(extendSession).toHaveBeenCalledTimes(1)
    expect(result.user.roles).toEqual(roles)
  })
})

describe('bootstrap owner', () => {
  const run = (over: Partial<AdapterUser>) => {
    const cb = createAuthConfig({ db: fakeDb().db, basePath: '/api/auth' }).callbacks!
      .session! as (p: { session: Session; user: AdapterUser }) => Promise<Session>
    return cb({ session: makeSession(), user: adapterUser(over) })
  }

  it('forces approved + siteOwner for the default owner email even when the DB says pending', async () => {
    const result = await run({ email: 'mwoolley2@gmail.com', status: 'pending' })
    expect(result.user.status).toBe('approved')
    expect(result.user.roles.siteOwner).toBe(true)
  })

  it('matches the owner email case-insensitively', async () => {
    const result = await run({ email: 'MWoolley2@Gmail.com', status: 'pending' })
    expect(result.user.roles.siteOwner).toBe(true)
  })

  it('leaves non-owner users untouched', async () => {
    const result = await run({ email: 'someone@else.com', status: 'pending' })
    expect(result.user.status).toBe('pending')
    expect(result.user.roles.siteOwner).toBe(false)
  })

  it('honors SITE_OWNER_EMAIL override and demotes the old default', async () => {
    vi.stubEnv('SITE_OWNER_EMAIL', 'boss@example.com')
    const boss = await run({ email: 'boss@example.com', status: 'pending' })
    expect(boss.user.roles.siteOwner).toBe(true)
    const oldOwner = await run({ email: 'mwoolley2@gmail.com', status: 'pending' })
    expect(oldOwner.user.roles.siteOwner).toBe(false)
    expect(oldOwner.user.status).toBe('pending')
  })
})

describe('events', () => {
  it('backfills googleSub when a google account links', async () => {
    const { db, update, set } = fakeDb()
    const config = createAuthConfig({ db, basePath: '/api/auth' })

    await config.events!.linkAccount!({
      user: adapterUser(),
      account: { provider: 'google', providerAccountId: 'sub-123' },
      profile: {},
    } as never)

    expect(update).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith({ googleSub: 'sub-123' })
  })

  it('ignores non-google account links', async () => {
    const { db, update } = fakeDb()
    const config = createAuthConfig({ db, basePath: '/api/auth' })

    await config.events!.linkAccount!({
      user: adapterUser(),
      account: { provider: 'github', providerAccountId: 'gh-1' },
      profile: {},
    } as never)

    expect(update).not.toHaveBeenCalled()
  })

  it('notifies onUserCreated for brand-new users with id and email', async () => {
    const onUserCreated = vi.fn()
    const config = createAuthConfig({ db: fakeDb().db, basePath: '/api/auth', onUserCreated })

    await config.events!.createUser!({ user: adapterUser() } as never)
    expect(onUserCreated).toHaveBeenCalledWith({ id: 'user-1', email: 'a@b.c' })

    await config.events!.createUser!({ user: adapterUser({ email: null as never }) } as never)
    expect(onUserCreated).toHaveBeenCalledTimes(1)
  })
})

describe('cookie wiring', () => {
  it('omits the cookies key when neither domain nor name is set', () => {
    const config = createAuthConfig({ db: fakeDb().db, basePath: '/api/auth' })
    expect(Object.prototype.hasOwnProperty.call(config, 'cookies')).toBe(false)
  })

  it('sets the cookie domain when cookieDomain is given', () => {
    const config = createAuthConfig({
      db: fakeDb().db,
      basePath: '/api/auth',
      cookieDomain: '.millerfamilyreunions.org',
    })
    expect(config.cookies?.sessionToken?.options?.domain).toBe('.millerfamilyreunions.org')
    // no name override — Auth.js default cookie name stays
    expect(config.cookies?.sessionToken).not.toHaveProperty('name')
  })

  it('overrides the cookie name when sessionCookieName is given', () => {
    const config = createAuthConfig({
      db: fakeDb().db,
      basePath: '/api/auth',
      sessionCookieName: 'alt.session-token',
    })
    expect(config.cookies?.sessionToken?.name).toBe('alt.session-token')
    expect(config.cookies?.sessionToken?.options?.domain).toBeUndefined()
  })

  it('marks the cookie secure only in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const prod = createAuthConfig({
      db: fakeDb().db,
      basePath: '/api/auth',
      cookieDomain: '.millerfamilyreunions.org',
    })
    expect(prod.cookies?.sessionToken?.options?.secure).toBe(true)

    vi.stubEnv('NODE_ENV', 'test')
    const dev = createAuthConfig({
      db: fakeDb().db,
      basePath: '/api/auth',
      cookieDomain: '.millerfamilyreunions.org',
    })
    expect(dev.cookies?.sessionToken?.options?.secure).toBe(false)
  })

  it('warns when production runs without a cookieDomain', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')

    createAuthConfig({ db: fakeDb().db, basePath: '/api/auth' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cookieDomain is unset'))

    warn.mockClear()
    createAuthConfig({
      db: fakeDb().db,
      basePath: '/api/auth',
      cookieDomain: '.millerfamilyreunions.org',
    })
    expect(warn).not.toHaveBeenCalled()
  })
})
