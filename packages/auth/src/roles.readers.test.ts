// The DB-backed roles readers, with the `postgres` client mocked at the
// module boundary — the SQL text and row mapping are what's under test, not
// the driver. (The pure helpers are covered in roles.test.ts.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state: { rows: unknown[]; queries: string[]; clientArgs: unknown[][] } = {
  rows: [],
  queries: [],
  clientArgs: [],
}

vi.mock('postgres', () => ({
  default: vi.fn((...args: unknown[]) => {
    state.clientArgs.push(args)
    return (strings: TemplateStringsArray, ...values: unknown[]) => {
      state.queries.push(strings.join('?') + '|' + values.join(','))
      return Promise.resolve(state.rows)
    }
  }),
}))

import {
  createRolesReader,
  createRolesReaderFromEnv,
  createReservationsAdminIdsReader,
  createReservationsAdminIdsReaderFromEnv,
  NO_ROLES,
} from './roles'

beforeEach(() => {
  state.rows = []
  state.queries = []
  state.clientArgs = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createRolesReader', () => {
  it('disables prepared statements (Neon pooled connections)', () => {
    createRolesReader('postgresql://x')
    expect(state.clientArgs[0]).toEqual(['postgresql://x', { prepare: false }])
  })

  it('maps a found row to UserRoles, keyed by identity user id', async () => {
    state.rows = [{ is_site_owner: false, is_site_manager: true, is_accounting_manager: false }]
    const read = createRolesReader('postgresql://x')

    const roles = await read('user-42')

    expect(roles).toEqual({ siteOwner: false, siteManager: true, accountingManager: false })
    expect(state.queries[0]).toContain('FROM portal_user_roles')
    expect(state.queries[0]).toContain('user-42')
  })

  it('returns NO_ROLES when the user has no row', async () => {
    state.rows = []
    const read = createRolesReader('postgresql://x')

    expect(await read('user-без-row')).toEqual(NO_ROLES)
  })
})

describe('createRolesReaderFromEnv', () => {
  it('throws when PORTAL_DATABASE_URL is unset', () => {
    vi.stubEnv('PORTAL_DATABASE_URL', undefined as unknown as string)
    expect(() => createRolesReaderFromEnv()).toThrow('PORTAL_DATABASE_URL is not set')
  })

  it('builds a working reader from the env connection string', async () => {
    vi.stubEnv('PORTAL_DATABASE_URL', 'postgresql://from-env')
    state.rows = [{ is_site_owner: true, is_site_manager: false, is_accounting_manager: false }]

    const read = createRolesReaderFromEnv()

    expect(state.clientArgs.at(-1)?.[0]).toBe('postgresql://from-env')
    expect((await read('u1')).siteOwner).toBe(true)
  })
})

describe('createReservationsAdminIdsReader', () => {
  it('returns the identity user ids of owners and site managers', async () => {
    state.rows = [{ identity_user_id: 'u-owner' }, { identity_user_id: 'u-manager' }]
    const list = createReservationsAdminIdsReader('postgresql://x')

    expect(await list()).toEqual(['u-owner', 'u-manager'])
    expect(state.queries[0]).toContain('is_site_owner OR is_site_manager')
  })

  it('returns an empty list when nobody holds the roles', async () => {
    state.rows = []
    const list = createReservationsAdminIdsReader('postgresql://x')

    expect(await list()).toEqual([])
  })
})

describe('createReservationsAdminIdsReaderFromEnv', () => {
  it('throws when PORTAL_DATABASE_URL is unset', () => {
    vi.stubEnv('PORTAL_DATABASE_URL', undefined as unknown as string)
    expect(() => createReservationsAdminIdsReaderFromEnv()).toThrow(
      'PORTAL_DATABASE_URL is not set',
    )
  })

  it('builds a working reader from the env connection string', async () => {
    vi.stubEnv('PORTAL_DATABASE_URL', 'postgresql://from-env-2')
    state.rows = [{ identity_user_id: 'u1' }]

    const list = createReservationsAdminIdsReaderFromEnv()

    expect(state.clientArgs.at(-1)?.[0]).toBe('postgresql://from-env-2')
    expect(await list()).toEqual(['u1'])
  })
})
