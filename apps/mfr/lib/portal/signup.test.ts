import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { shareholder } from '@/lib/db/schema'

// The DB layers and the mail transport are the seams; everything else runs for
// real so the decision logic (match -> approve, no match -> notify) is the thing
// under test.
const { findFirst, updateWhere, updateSet, update, insertValues, insert } = vi.hoisted(() => {
  const updateWhere = vi.fn().mockResolvedValue({})
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))
  const insertValues = vi.fn().mockResolvedValue({})
  const insert = vi.fn(() => ({ values: insertValues }))
  return { findFirst: vi.fn(), updateWhere, updateSet, update, insertValues, insert }
})

const { identityUpdateWhere, identityUpdateSet, identityUpdate, identitySelect } = vi.hoisted(
  () => {
    const identityUpdateWhere = vi.fn().mockResolvedValue({})
    const identityUpdateSet = vi.fn(() => ({ where: identityUpdateWhere }))
    const identityUpdate = vi.fn(() => ({ set: identityUpdateSet }))
    return {
      identityUpdateWhere,
      identityUpdateSet,
      identityUpdate,
      identitySelect: vi.fn(),
    }
  },
)

const { portalSelect } = vi.hoisted(() => ({ portalSelect: vi.fn() }))
const { sendEmailMock, loggerMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue(undefined),
  loggerMock: { error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/lib/db/client', () => ({
  db: { query: { shareholder: { findFirst } }, update, insert },
}))
vi.mock('@/lib/identityDb', () => ({
  identityDb: { update: identityUpdate, select: identitySelect },
}))
vi.mock('@/lib/portalDb', () => ({ portalDb: { select: portalSelect } }))
vi.mock('@/lib/reservations/email', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/reservations/logger', () => ({ logger: loggerMock }))

import { handleNewSignup, listAdminEmails, SIGNUP_ALERT_SMS_DEFAULT } from './signup'

/** portalDb.select().from().where() -> role rows */
function portalRoles(rows: { id: string }[]) {
  portalSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) })
}

/** identityDb.select().from().where() -> user rows */
function identityUsers(rows: { email: string }[]) {
  identitySelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) })
}

const NEW_USER = { id: 'u-new', email: 'Michele@Example.com', name: 'Michele Anderegg' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  updateWhere.mockResolvedValue({})
  identityUpdateWhere.mockResolvedValue({})
  insertValues.mockResolvedValue({})
  sendEmailMock.mockResolvedValue(undefined)
  portalRoles([{ id: 'owner-1' }])
  identityUsers([{ email: 'owner@example.com' }])
})

describe('listAdminEmails', () => {
  it('returns the approved role-holders', async () => {
    portalRoles([{ id: 'owner-1' }, { id: 'mgr-1' }])
    identityUsers([{ email: 'owner@example.com' }, { email: 'mgr@example.com' }])

    await expect(listAdminEmails()).resolves.toEqual(['owner@example.com', 'mgr@example.com'])
  })

  it('short-circuits without an identity query when nobody holds a role', async () => {
    portalRoles([])

    await expect(listAdminEmails()).resolves.toEqual([])
    expect(identitySelect).not.toHaveBeenCalled()
  })
})

describe('handleNewSignup — email matches a shareholder', () => {
  beforeEach(() => {
    findFirst.mockResolvedValue({ id: 'sh-1', userId: null })
  })

  it('links the shareholder, approves the account, and sends no email', async () => {
    await expect(handleNewSignup(NEW_USER)).resolves.toBe('auto-approved')

    expect(updateSet).toHaveBeenCalledWith({ userId: 'u-new' })
    expect(identityUpdateSet).toHaveBeenCalledWith({ status: 'approved' })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('matches case-insensitively on the login email', async () => {
    await handleNewSignup(NEW_USER)

    // NEW_USER signs in as "Michele@Example.com"; Shareholder emails are stored
    // lowercased, so the lookup has to normalize or it would never match.
    expect(findFirst).toHaveBeenCalledWith({
      where: eq(shareholder.email, 'michele@example.com'),
    })
  })

  it('records the auto-approval in the activity log', async () => {
    await handleNewSignup(NEW_USER)

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user_auto_approved',
        actorUserId: 'u-new',
        metadata: { shareholderId: 'sh-1', matchedOn: 'email' },
      }),
    )
  })

  it('skips the link write when the shareholder is already linked to them', async () => {
    findFirst.mockResolvedValue({ id: 'sh-1', userId: 'u-new' })

    await expect(handleNewSignup(NEW_USER)).resolves.toBe('auto-approved')
    expect(update).not.toHaveBeenCalled()
    expect(identityUpdateSet).toHaveBeenCalledWith({ status: 'approved' })
  })

  it('does NOT approve when the link write fails — no approval on a link that did not happen', async () => {
    updateWhere.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }))

    await expect(handleNewSignup(NEW_USER)).resolves.toBe('failed')
    expect(identityUpdateSet).not.toHaveBeenCalled()
  })
})

describe('handleNewSignup — no shareholder match', () => {
  beforeEach(() => {
    findFirst.mockResolvedValue(undefined)
  })

  it('leaves them pending and notifies the admins plus the SMS gateway', async () => {
    portalRoles([{ id: 'owner-1' }, { id: 'mgr-1' }])
    identityUsers([{ email: 'owner@example.com' }, { email: 'mgr@example.com' }])

    await expect(handleNewSignup(NEW_USER)).resolves.toBe('pending-admins-notified')

    // Nothing was approved or linked.
    expect(identityUpdateSet).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()

    const call = sendEmailMock.mock.calls[0][0]
    expect([call.to, ...call.cc]).toEqual([
      'owner@example.com',
      'mgr@example.com',
      SIGNUP_ALERT_SMS_DEFAULT,
    ])
  })

  it('puts the signup name in the subject and a direct User Management link in the body', async () => {
    vi.stubEnv('APP_BASE_URL', 'https://millerfamilyreunions.org')

    await handleNewSignup(NEW_USER)

    const call = sendEmailMock.mock.calls[0][0]
    expect(call.subject).toBe('New signup: Michele Anderegg')
    expect(call.react.props.adminUrl).toBe('https://millerfamilyreunions.org/admin/users')
    expect(call.react.props.signupEmail).toBe('Michele@Example.com')
  })

  it('falls back to the email as a display name when Google supplied none', async () => {
    await handleNewSignup({ id: 'u-new', email: 'nobody@example.com', name: null })

    expect(sendEmailMock.mock.calls[0][0].subject).toBe('New signup: nobody@example.com')
  })

  it('honours SIGNUP_ALERT_SMS_TO, and an empty value turns the text off', async () => {
    vi.stubEnv('SIGNUP_ALERT_SMS_TO', '5551234567@vtext.net')
    await handleNewSignup(NEW_USER)
    expect(sendEmailMock.mock.calls[0][0].cc).toContain('5551234567@vtext.net')

    sendEmailMock.mockClear()
    vi.stubEnv('SIGNUP_ALERT_SMS_TO', '')
    await handleNewSignup(NEW_USER)
    expect(sendEmailMock.mock.calls[0][0].cc).toEqual([])
  })

  it('still sends to the SMS gateway when no admin has a role yet', async () => {
    portalRoles([])

    await handleNewSignup(NEW_USER)

    const call = sendEmailMock.mock.calls[0][0]
    expect(call.to).toBe(SIGNUP_ALERT_SMS_DEFAULT)
    expect(call.cc).toEqual([])
  })

  it('warns instead of sending when there is nobody at all to notify', async () => {
    portalRoles([])
    vi.stubEnv('SIGNUP_ALERT_SMS_TO', '')

    await expect(handleNewSignup(NEW_USER)).resolves.toBe('pending-admins-notified')
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalled()
  })
})

describe('handleNewSignup — failures never break the sign-in', () => {
  it('swallows and logs a failed lookup', async () => {
    findFirst.mockRejectedValue(new Error('db down'))

    await expect(handleNewSignup(NEW_USER)).resolves.toBe('failed')
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('swallows and logs a failed notification', async () => {
    findFirst.mockResolvedValue(undefined)
    sendEmailMock.mockRejectedValue(new Error('SES down'))

    await expect(handleNewSignup(NEW_USER)).resolves.toBe('failed')
    expect(loggerMock.error).toHaveBeenCalled()
  })
})
