// The DB clients are the seam; the WHERE clauses are rendered to SQL so the
// role rule (site owner or site manager, never accounting manager alone) and
// the approved-only rule are what's asserted.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const { portalSelect, identitySelect } = vi.hoisted(() => ({
  portalSelect: vi.fn(),
  identitySelect: vi.fn(),
}))
vi.mock('@/lib/portalDb', () => ({ portalDb: { select: portalSelect } }))
vi.mock('@/lib/identityDb', () => ({ identityDb: { select: identitySelect } }))

import { findApprovedMember, listSiteAdminEmails } from './members'

const dialect = new PgDialect()
const sqlOf = (where: SQL) => dialect.sqlToQuery(where)

function chain(rows: unknown[], wheres: SQL[]) {
  const limit = vi.fn(() => Promise.resolve(rows))
  const where = vi.fn((w: SQL) => {
    wheres.push(w)
    const p = Promise.resolve(rows) as Promise<unknown[]> & { limit: typeof limit }
    p.limit = limit
    return p
  })
  return { from: () => ({ where }) }
}

beforeEach(() => vi.clearAllMocks())

describe('listSiteAdminEmails', () => {
  it('selects approved site owners and site managers only', async () => {
    const wheres: SQL[] = []
    portalSelect.mockReturnValue(chain([{ id: 'u1' }, { id: 'u2' }], wheres))
    identitySelect.mockReturnValue(chain([{ email: 'owner@example.com' }], wheres))
    expect(await listSiteAdminEmails()).toEqual(['owner@example.com'])
    const roles = sqlOf(wheres[0]).sql
    expect(roles).toContain('"is_site_owner"')
    expect(roles).toContain('"is_site_manager"')
    expect(roles).not.toContain('accounting')
    const users = sqlOf(wheres[1])
    expect(users.sql).toContain('"status"')
    expect(users.params).toEqual(expect.arrayContaining(['u1', 'u2', 'approved']))
  })
  it('skips the user lookup when no one holds an admin role', async () => {
    portalSelect.mockReturnValue(chain([], []))
    expect(await listSiteAdminEmails()).toEqual([])
    expect(identitySelect).not.toHaveBeenCalled()
  })
})

describe('findApprovedMember', () => {
  it('matches the email case-insensitively among approved users', async () => {
    const wheres: SQL[] = []
    identitySelect.mockReturnValue(chain([{ email: 'Ann@example.com', name: null }], wheres))
    expect(await findApprovedMember(' ANN@example.com ')).toEqual({
      email: 'Ann@example.com',
      name: '',
    })
    expect(sqlOf(wheres[0]).params).toEqual(expect.arrayContaining(['ann@example.com', 'approved']))
  })
  it('returns null for unknown or blank emails', async () => {
    identitySelect.mockReturnValue(chain([], []))
    expect(await findApprovedMember('x@example.com')).toBeNull()
    expect(await findApprovedMember('  ')).toBeNull()
  })
})
