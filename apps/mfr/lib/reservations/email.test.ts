import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'

const sendMock = vi.fn()
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = sendMock
  },
  SendEmailCommand: class {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
}))
vi.mock('@/lib/reservations/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { appUrl, plusAddress, resolveRecipient, sendEmail } from './email'
import { logger } from '@/lib/reservations/logger'

const react = createElement('p', null, 'hello')

function sentInput() {
  return (vi.mocked(sendMock).mock.calls[0][0] as { input: Record<string, never> }).input
}

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue({})
  vi.mocked(logger.error).mockReset()
  vi.mocked(logger.warn).mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('appUrl', () => {
  it('defaults to localhost with the /reservations prefix', () => {
    vi.stubEnv('APP_BASE_URL', '')
    expect(appUrl('/')).toBe('http://localhost:3000/reservations/')
  })

  it('appends the /reservations section to a bare origin', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org')
    expect(appUrl('/history')).toBe('https://example.org/reservations/history')
  })

  it('is idempotent when APP_BASE_URL already includes the section', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org/reservations/')
    expect(appUrl('/history')).toBe('https://example.org/reservations/history')
  })

  it('adds a leading slash when the path lacks one', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org')
    expect(appUrl('history')).toBe('https://example.org/reservations/history')
  })
})

describe('sendEmail', () => {
  beforeEach(() => {
    // These assert the real-delivery path; production is the only env that
    // enables it. Guard/redirect behavior is covered separately below.
    vi.stubEnv('EMAIL_ENABLED', 'true')
  })

  it('sends from EMAIL_FROM with to/cc/replyTo and rendered HTML', async () => {
    vi.stubEnv('EMAIL_FROM', 'custom@example.com')
    await sendEmail({
      to: 'owner@example.com',
      cc: ['admin@example.com'],
      subject: 'Test subject',
      react,
      replyTo: 'actor@example.com',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const input = sentInput()
    expect(input).toMatchObject({
      FromEmailAddress: 'custom@example.com',
      Destination: { ToAddresses: ['owner@example.com'], CcAddresses: ['admin@example.com'] },
      ReplyToAddresses: ['actor@example.com'],
    })
    const content = input.Content as {
      Simple: { Subject: { Data: string }; Body: { Html: { Data: string } } }
    }
    expect(content.Simple.Subject.Data).toBe('Test subject')
    expect(content.Simple.Body.Html.Data).toContain('hello')
  })

  it('falls back to hello@millerfamilyreunions.org when EMAIL_FROM is unset', async () => {
    vi.stubEnv('EMAIL_FROM', undefined)
    await sendEmail({ to: 'owner@example.com', cc: [], subject: 'Test', react })
    expect(sentInput()).toMatchObject({
      FromEmailAddress: 'hello@millerfamilyreunions.org',
    })
  })

  it('omits cc and replyTo when not provided', async () => {
    await sendEmail({ to: 'owner@example.com', cc: [], subject: 'Test', react })
    const input = sentInput() as unknown as {
      Destination: Record<string, unknown>
      ReplyToAddresses?: unknown
    }
    expect(input.Destination.CcAddresses).toBeUndefined()
    expect(input.ReplyToAddresses).toBeUndefined()
  })

  it('logs and does not throw when the SES send fails', async () => {
    sendMock.mockRejectedValue(new Error('credentials missing'))
    await expect(
      sendEmail({ to: 'owner@example.com', subject: 'Test', react }),
    ).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('email guard (non-prod)', () => {
  it('plusAddress folds the full original address into the inbox', () => {
    expect(plusAddress('mwoolley2@gmail.com', 'dbrown@gmail.com')).toBe(
      'mwoolley2+dbrown=gmail.com@gmail.com',
    )
  })

  it('resolveRecipient redirects to the override inbox when EMAIL_ENABLED is unset', () => {
    vi.stubEnv('EMAIL_ENABLED', '')
    vi.stubEnv('EMAIL_OVERRIDE_TO', 'test@example.com')
    expect(resolveRecipient('owner@example.com')).toEqual({
      deliver: true,
      to: 'test+owner=example.com@example.com',
      redirectedFrom: 'owner@example.com',
    })
  })

  it('resolveRecipient drops the message when disabled with no override', () => {
    vi.stubEnv('EMAIL_ENABLED', '')
    vi.stubEnv('EMAIL_OVERRIDE_TO', '')
    expect(resolveRecipient('owner@example.com').deliver).toBe(false)
  })

  it('sendEmail redirects both to and cc to the override inbox and prefixes the subject', async () => {
    vi.stubEnv('EMAIL_ENABLED', '')
    vi.stubEnv('EMAIL_OVERRIDE_TO', 'test@example.com')
    await sendEmail({
      to: 'owner@example.com',
      cc: ['admin@example.com'],
      subject: 'Reservation confirmed',
      react,
    })
    const input = sentInput() as unknown as {
      Destination: { ToAddresses: string[]; CcAddresses?: string[] }
      Content: { Simple: { Subject: { Data: string } } }
    }
    expect(input.Destination.ToAddresses).toEqual(['test+owner=example.com@example.com'])
    expect(input.Destination.CcAddresses).toEqual(['test+admin=example.com@example.com'])
    expect(input.Content.Simple.Subject.Data).toBe('[dev→owner@example.com] Reservation confirmed')
  })

  it('sendEmail sends nothing and never ccs admins when disabled with no override', async () => {
    vi.stubEnv('EMAIL_ENABLED', '')
    vi.stubEnv('EMAIL_OVERRIDE_TO', '')
    await sendEmail({ to: 'owner@example.com', cc: ['admin@example.com'], subject: 'Test', react })
    expect(sendMock).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })
})
