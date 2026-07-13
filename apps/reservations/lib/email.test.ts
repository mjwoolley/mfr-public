import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { appUrl, sendEmail } from './email'
import { logger } from '@/lib/logger'

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue({ error: null })
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
  it('sends from RESEND_FROM_EMAIL with to/subject/cc/replyTo', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'reservations@example.org')
    await sendEmail({
      to: 'owner@example.com',
      cc: ['admin@example.com'],
      subject: 'Test',
      react: {} as React.ReactElement,
      replyTo: 'actor@example.com',
    })
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'reservations@example.org',
        to: 'owner@example.com',
        cc: ['admin@example.com'],
        subject: 'Test',
        replyTo: 'actor@example.com',
      })
    )
  })

  it('omits cc when the list is empty', async () => {
    await sendEmail({ to: 'owner@example.com', cc: [], subject: 'Test', react: {} as React.ReactElement })
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ cc: undefined }))
  })

  it('logs and does not throw when Resend reports an error', async () => {
    sendMock.mockResolvedValue({ error: { message: 'invalid api key' } })
    await expect(
      sendEmail({ to: 'owner@example.com', subject: 'Test', react: {} as React.ReactElement })
    ).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})
