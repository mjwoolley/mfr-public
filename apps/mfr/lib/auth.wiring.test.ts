// The portal's NextAuth wiring: web is the sign-in surface (pages.signIn) and
// attaches no app-specific session fields. next-auth and the shared factory
// are mocked so the module's load-time wiring can be asserted without env.
import { describe, expect, it, vi } from 'vitest'

const createAuthConfig = vi.hoisted(() =>
  vi.fn<(opts: Record<string, unknown>) => { marker: string }>(() => ({ marker: 'config' })),
)

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}))
vi.mock('@mfr/auth', () => ({
  createAuthConfig,
  createRolesReaderFromEnv: vi.fn(() => async () => ({
    siteOwner: false,
    siteManager: false,
    accountingManager: false,
  })),
}))
vi.mock('./identityDb', () => ({ identityDb: { marker: 'identity-db' } }))

import * as authModule from './auth'

describe('portal auth wiring', () => {
  it('exports the NextAuth surface', () => {
    expect(authModule.auth).toBeTypeOf('function')
    expect(authModule.signIn).toBeTypeOf('function')
    expect(authModule.signOut).toBeTypeOf('function')
    expect(authModule.handlers).toBeDefined()
  })

  it('configures the portal as the sign-in surface with shared roles', () => {
    expect(createAuthConfig).toHaveBeenCalledTimes(1)
    const opts = createAuthConfig.mock.calls[0][0]
    expect(opts.basePath).toBe('/api/auth')
    expect(opts.pages).toEqual({ signIn: '/sign-in' })
    expect(opts.db).toEqual({ marker: 'identity-db' })
    expect(opts.getUserRoles).toBeTypeOf('function')
    // web attaches nothing app-specific and never sees new users first
    expect(opts.extendSession).toBeUndefined()
    expect(opts.onUserCreated).toBeUndefined()
  })
})
