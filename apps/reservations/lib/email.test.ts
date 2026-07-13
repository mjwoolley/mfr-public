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
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { appUrl, sendEmail } from './email'
import { logger } from '@/lib/logger'

const react = createElement('p', null, 'hello')

function sentInput() {
  return (vi.mocked(sendMock).mock.calls[0][0] as { input: Record<string, never> }).input
}

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue({})
  vi.mocked(logger.error).mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('appUrl', () => {
  it('defaults to localhost with the /reservations prefix', () => {
    vi.stubEnv('APP_BASE_URL', '')
    expect(appUrl('/')).toBe('http://localhost:3000/reservations/')
  })

  it('joins without dropping the base path segment and strips trailing slash', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org/reservations/')
    expect(appUrl('/history')).toBe('https://example.org/reservations/history')
  })

  it('adds a leading slash when the path lacks one', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org/reservations')
    expect(appUrl('history')).toBe('https://example.org/reservations/history')
  })
})

describe('sendEmail', () => {
  it('sends from EMAIL_FROM with to/cc/replyTo and rendered HTML', async () => {
    vi.stubEnv('EMAIL_FROM', 'reservations@millerfamilyreunions.org')
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
      FromEmailAddress: 'reservations@millerfamilyreunions.org',
      Destination: { ToAddresses: ['owner@example.com'], CcAddresses: ['admin@example.com'] },
      ReplyToAddresses: ['actor@example.com'],
    })
    const content = input.Content as { Simple: { Subject: { Data: string }; Body: { Html: { Data: string } } } }
    expect(content.Simple.Subject.Data).toBe('Test subject')
    expect(content.Simple.Body.Html.Data).toContain('hello')
  })

  it('omits cc and replyTo when not provided', async () => {
    await sendEmail({ to: 'owner@example.com', cc: [], subject: 'Test', react })
    const input = sentInput() as { Destination: Record<string, unknown>; ReplyToAddresses?: unknown }
    expect(input.Destination.CcAddresses).toBeUndefined()
    expect(input.ReplyToAddresses).toBeUndefined()
  })

  it('logs and does not throw when the SES send fails', async () => {
    sendMock.mockRejectedValue(new Error('credentials missing'))
    await expect(sendEmail({ to: 'owner@example.com', subject: 'Test', react })).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})
