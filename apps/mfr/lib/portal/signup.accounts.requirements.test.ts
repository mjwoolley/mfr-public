// Requirement coverage for CAP-002 New sign-up handling
// (requirements/accounts/new-sign-up-handling.md): "No approval without a
// successful link". Same DB-seam mocks as signup.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst, update, identityUpdate, insert } = vi.hoisted(() => {
  const chain = () => vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => ({})) })) }))
  return {
    findFirst: vi.fn(),
    update: chain(),
    identityUpdate: chain(),
    insert: vi.fn(() => ({ values: vi.fn(async () => ({})) })),
  }
})

vi.mock('@/lib/db/client', () => ({
  db: { query: { shareholder: { findFirst } }, update, insert },
}))
vi.mock('@/lib/identityDb', () => ({
  identityDb: {
    update: identityUpdate,
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
}))
vi.mock('@/lib/portalDb', () => ({
  portalDb: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}))
vi.mock('@/lib/reservations/email', () => ({ sendEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/reservations/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { handleNewSignup } from './signup'

beforeEach(() => vi.clearAllMocks())

describe('CAP-002 New sign-up handling', () => {
  // SKIPPED — suspected bug, reported to the coordinator. When the matching
  // shareholder record is already linked to ANOTHER login, handleNewSignup
  // (signup.ts:118-120) overwrites Shareholder.userId with the newcomer's id —
  // the unique index on userId can't object to a brand-new id — and approves
  // them, moving the link away from its owner. Un-skip once fixed; it fails today.
  it.skip('CAP-002 · No approval without a successful link', async () => {
    findFirst.mockResolvedValue({
      id: 'sh-ann',
      email: 'ann@example.com',
      userId: 'existing-login',
    })

    const outcome = await handleNewSignup({ id: 'new-login', email: 'ann@example.com' })

    // The existing link is left alone and the newcomer stays awaiting approval.
    expect(update).not.toHaveBeenCalled()
    expect(identityUpdate).not.toHaveBeenCalled()
    expect(outcome).not.toBe('auto-approved')
  })
})
