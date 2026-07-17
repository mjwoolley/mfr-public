// Shape assertions for the shared identity schema — the contract every app's
// Auth.js adapter and the e2e session seeding rely on.
import { describe, expect, it } from 'vitest'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { users, accounts, sessions, verificationTokens, userStatusEnum } from './schema'

describe('identity schema', () => {
  it('users: uuid pk, unique email/googleSub, status defaults to pending', () => {
    const cols = getTableColumns(users)

    expect(getTableName(users)).toBe('users')
    expect(cols.id.primary).toBe(true)
    expect(cols.email.notNull).toBe(true)
    expect(cols.email.isUnique).toBe(true)
    expect(cols.googleSub.isUnique).toBe(true)
    expect(cols.status.notNull).toBe(true)
    expect(cols.status.default).toBe('pending')
  })

  it('models the three portal statuses', () => {
    expect(userStatusEnum.enumValues).toEqual(['pending', 'approved', 'blocked'])
  })

  it('accounts: keyed by provider + providerAccountId, cascades from users', () => {
    const cols = getTableColumns(accounts)

    expect(getTableName(accounts)).toBe('accounts')
    expect(cols.userId.notNull).toBe(true)
    expect(cols.provider.notNull).toBe(true)
    expect(cols.providerAccountId.notNull).toBe(true)
  })

  it('sessions: token pk with expiry, tied to a user', () => {
    const cols = getTableColumns(sessions)

    expect(getTableName(sessions)).toBe('sessions')
    expect(cols.sessionToken.primary).toBe(true)
    expect(cols.userId.notNull).toBe(true)
    expect(cols.expires.notNull).toBe(true)
  })

  it('accounts and sessions cascade-delete with their user', () => {
    for (const table of [accounts, sessions]) {
      const fks = getTableConfig(table).foreignKeys
      expect(fks.length).toBe(1)
      const ref = fks[0].reference()
      expect(getTableName(ref.foreignTable)).toBe('users')
      expect(ref.foreignColumns[0].name).toBe('id')
      expect(fks[0].onDelete).toBe('cascade')
    }
  })

  it('verification tokens: identifier + token + expiry', () => {
    const cols = getTableColumns(verificationTokens)

    expect(cols.identifier.notNull).toBe(true)
    expect(cols.token.notNull).toBe(true)
    expect(cols.expires.notNull).toBe(true)
  })
})
