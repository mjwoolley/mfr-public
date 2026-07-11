import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createIdentityDbFromEnv } from './identityDbFromEnv'

describe('createIdentityDbFromEnv', () => {
  const original = process.env.IDENTITY_DATABASE_URL

  afterEach(() => {
    if (original === undefined) {
      delete process.env.IDENTITY_DATABASE_URL
    } else {
      process.env.IDENTITY_DATABASE_URL = original
    }
  })

  it('throws when IDENTITY_DATABASE_URL is not set', () => {
    delete process.env.IDENTITY_DATABASE_URL
    expect(() => createIdentityDbFromEnv()).toThrow('IDENTITY_DATABASE_URL is not set')
  })

  it('constructs a db client when IDENTITY_DATABASE_URL is set', () => {
    // createIdentityDb only builds the drizzle client and lazily-connecting
    // postgres-js client — it never issues a query — so a syntactically
    // valid but unreachable connection string is enough (same approach as
    // config.test.ts's fakeDb).
    process.env.IDENTITY_DATABASE_URL = 'postgresql://user:pass@localhost:1/db'
    expect(() => createIdentityDbFromEnv()).not.toThrow()
  })
})
