// Requirements coverage for CAP-010 · The signup text-message alert is
// redirected like any email (requirements/portal/email-safety-outside-production.md).
//
// Unlike signup.test.ts (which mocks sendEmail), this runs handleNewSignup
// through the REAL reservations email guard; only the DB layers and the SES
// transport are mocked, so the addresses SES would be handed are what's asserted.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { sesSend, findFirst, portalSelect, identitySelect } = vi.hoisted(() => ({
  sesSend: vi.fn(),
  findFirst: vi.fn(),
  portalSelect: vi.fn(),
  identitySelect: vi.fn(),
}))

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = sesSend
  },
  SendEmailCommand: class {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
}))
vi.mock('@/lib/db/client', () => ({
  db: { query: { shareholder: { findFirst } }, update: vi.fn(), insert: vi.fn() },
}))
vi.mock('@/lib/identityDb', () => ({ identityDb: { select: identitySelect, update: vi.fn() } }))
vi.mock('@/lib/portalDb', () => ({ portalDb: { select: portalSelect } }))
vi.mock('@/lib/reservations/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { handleNewSignup, SIGNUP_ALERT_SMS_DEFAULT } from './signup'

const SIGNUP = { id: 'u-new', email: 'newbie@example.com', name: 'New Person' }

function adminRows(emails: string[]) {
  portalSelect.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(emails.map((_, i) => ({ id: `admin-${i}` }))) }),
  })
  identitySelect.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(emails.map((email) => ({ email }))) }),
  })
}

type Sent = { Destination: { ToAddresses: string[]; CcAddresses?: string[] } }
function sentDestination() {
  expect(sesSend).toHaveBeenCalledTimes(1)
  return (sesSend.mock.calls[0][0] as { input: Sent }).input.Destination
}

beforeEach(() => {
  vi.clearAllMocks()
  sesSend.mockResolvedValue({})
  findFirst.mockResolvedValue(undefined) // no shareholder match -> alert
  vi.stubEnv('EMAIL_ENABLED', '')
  vi.stubEnv('EMAIL_OVERRIDE_TO', 'tester@gmail.com')
  vi.stubEnv('SIGNUP_ALERT_SMS_TO', SIGNUP_ALERT_SMS_DEFAULT)
})
afterEach(() => vi.unstubAllEnvs())

describe('CAP-010 · The signup text-message alert is redirected like any email', () => {
  it('with admins copied, the SMS gateway lands in the testing inbox and no phone receives it', async () => {
    adminRows(['owner@example.com'])
    await expect(handleNewSignup(SIGNUP)).resolves.toBe('pending-admins-notified')

    const dest = sentDestination()
    const all = [...dest.ToAddresses, ...(dest.CcAddresses ?? [])]
    expect(all).toEqual([
      'tester+owner=example.com@gmail.com',
      `tester+${SIGNUP_ALERT_SMS_DEFAULT.replace('@', '=')}@gmail.com`,
    ])
    expect(all).not.toContain(SIGNUP_ALERT_SMS_DEFAULT)
    for (const addr of all) expect(addr).toMatch(/^tester\+.*@gmail\.com$/)
  })

  it('when the SMS gateway is the only recipient, it is still redirected', async () => {
    adminRows([])
    await handleNewSignup(SIGNUP)

    const dest = sentDestination()
    expect(dest.ToAddresses).toEqual([
      `tester+${SIGNUP_ALERT_SMS_DEFAULT.replace('@', '=')}@gmail.com`,
    ])
    expect(dest.CcAddresses).toBeUndefined()
  })

  it('with no testing inbox set, the SMS alert is dropped entirely', async () => {
    vi.stubEnv('EMAIL_OVERRIDE_TO', '')
    adminRows(['owner@example.com'])
    await handleNewSignup(SIGNUP)
    expect(sesSend).not.toHaveBeenCalled()
  })
})
