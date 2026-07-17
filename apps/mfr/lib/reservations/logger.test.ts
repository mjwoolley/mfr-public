import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  it('emits a single line of valid JSON containing the message and custom fields', () => {
    logger.info({ userId: 'abc123' }, 'test event')

    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    const written = stdoutSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(written.trim())

    expect(parsed.msg).toBe('test event')
    expect(parsed.userId).toBe('abc123')
    expect(typeof parsed.level).not.toBe('undefined')
    expect(typeof parsed.time).not.toBe('undefined')
  })
})
