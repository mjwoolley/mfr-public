import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendEmailMock, loggerMock, listSiteAdminEmails } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue(true),
  loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  listSiteAdminEmails: vi.fn(),
}))
vi.mock('@/lib/reservations/email', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/reservations/logger', () => ({ logger: loggerMock }))
vi.mock('./members', () => ({ listSiteAdminEmails }))

import { forwardReplyToAdmins, memberReplyTo, sendFeedbackAdminEmail } from './notifications'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())

describe('feedback notifications', () => {
  it('routes member replies to the admin mailbox while inbound replies are off', () => {
    vi.stubEnv('FEEDBACK_REPLY_DOMAIN', '')
    vi.stubEnv('FEEDBACK_REPLY_TO', 'admins@example.org')
    expect(memberReplyTo('KAN-1', 'a@x.org')).toBe('admins@example.org')
    vi.stubEnv('FEEDBACK_REPLY_TO', '')
    expect(memberReplyTo('KAN-1', 'a@x.org')).toBeUndefined()
  })

  it('logs and skips the admin email when there are no site admins', async () => {
    listSiteAdminEmails.mockResolvedValue([])
    const input = {
      issueKey: 'KAN-1',
      issueUrl: null,
      memberName: 'A',
      memberEmail: 'a@x.org',
      pagePath: '/',
      message: 'm',
    }
    expect(await sendFeedbackAdminEmail(input)).toBe(false)
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  it('cannot forward a reply without FEEDBACK_REPLY_TO', async () => {
    vi.stubEnv('FEEDBACK_REPLY_TO', '')
    expect(
      await forwardReplyToAdmins({
        issueKey: 'KAN-1',
        memberName: 'A',
        memberEmail: 'a@x.org',
        reply: 'r',
        deliveryId: 'd',
      }),
    ).toBe(false)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
