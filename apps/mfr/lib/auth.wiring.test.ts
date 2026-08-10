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
  createRolesReader: vi.fn(() => async () => ({
    siteOwner: false,
    siteManager: false,
    accountingManager: false,
  })),
}))
vi.mock('./identityDb', () => ({ identityDb: { marker: 'identity-db' } }))

const { insertValues, handleNewSignup } = vi.hoisted(() => ({
  insertValues: vi.fn().mockResolvedValue({}),
  handleNewSignup: vi.fn().mockResolvedValue('pending-admins-notified'),
}))
vi.mock('./db/client', () => ({
  db: {
    insert: vi.fn(() => ({ values: insertValues })),
    query: { shareholder: {} },
    update: vi.fn(),
  },
}))
vi.mock('./portal/signup', () => ({ handleNewSignup }))

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
    expect(opts.pages).toEqual({ signIn: '/sign-in', error: '/sign-in' })
    expect(opts.db).toEqual({ marker: 'identity-db' })
    expect(opts.getUserRoles).toBeTypeOf('function')
    // The single unified instance merges the two per-section session hooks:
    // accounting's extendSession (linked Shareholder id) and onUserCreated
    // (activity-feed entry, then link/auto-approve or notify the admins).
    expect(opts.extendSession).toBeTypeOf('function')
    expect(opts.onUserCreated).toBeTypeOf('function')
  })

  it('routes a brand-new signup through the link/approve/notify handler', async () => {
    const opts = createAuthConfig.mock.calls[0][0] as {
      onUserCreated: (u: { id: string; email: string; name?: string | null }) => Promise<void>
    }

    await opts.onUserCreated({ id: 'u-new', email: 'new@example.com', name: 'New Person' })

    // The activity-feed entry still happens...
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'user_signed_up', actorUserId: 'u-new' }),
    )
    // ...and the name is forwarded, not dropped — it drives the notification
    // subject and the shareholder name matching.
    expect(handleNewSignup).toHaveBeenCalledWith({
      id: 'u-new',
      email: 'new@example.com',
      name: 'New Person',
    })
  })
})
