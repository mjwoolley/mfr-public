import { describe, it, expect } from 'vitest'
import { createAuthConfig } from './config'
import { createIdentityDb } from './db'

// createAuthConfig only builds the config object and wires up the adapter
// — it never issues a query — so a client with a syntactically valid but
// unreachable connection string is enough; postgres-js connects lazily.
const fakeDb = createIdentityDb('postgresql://user:pass@localhost:1/db')

describe('createAuthConfig', () => {
  it('omits the pages key entirely when no pages option is given', () => {
    const config = createAuthConfig({ db: fakeDb, basePath: '/api/auth' })
    // @auth/core's init merges user config over `{ pages: {}, ... }` via
    // object spread: `{ pages: {}, ...config }`. An explicit `pages:
    // undefined` own-property here overwrites that default (object spread
    // copies own keys regardless of value), leaving `options.pages`
    // undefined — which crashes on `pages.newUser` for every new user's
    // first sign-in. The key must be absent, not present-and-undefined.
    expect(Object.prototype.hasOwnProperty.call(config, 'pages')).toBe(false)
  })

  it('includes the pages key when pages are explicitly configured', () => {
    const config = createAuthConfig({
      db: fakeDb,
      basePath: '/api/auth',
      pages: { signIn: '/sign-in' },
    })
    expect(config.pages).toEqual({ signIn: '/sign-in' })
  })
})
