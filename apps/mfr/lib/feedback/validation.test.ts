import { describe, expect, it } from 'vitest'
import {
  EMPTY_FEEDBACK_ERROR,
  LONG_FEEDBACK_ERROR,
  firstLineSummary,
  sanitizePagePath,
  summarizeUserAgent,
  validateFeedbackMessage,
} from './validation'

describe('validateFeedbackMessage', () => {
  it('trims and accepts 1 to 2,000 characters', () => {
    expect(validateFeedbackMessage('  hi \n')).toEqual({ ok: true, message: 'hi' })
    expect(validateFeedbackMessage(` ${'a'.repeat(2000)} `)).toEqual({
      ok: true,
      message: 'a'.repeat(2000),
    })
  })
  it('rejects empty, whitespace, non-strings and over-long messages', () => {
    expect(validateFeedbackMessage('')).toEqual({ ok: false, error: EMPTY_FEEDBACK_ERROR })
    expect(validateFeedbackMessage(' \t\n')).toEqual({ ok: false, error: EMPTY_FEEDBACK_ERROR })
    expect(validateFeedbackMessage(42)).toEqual({ ok: false, error: EMPTY_FEEDBACK_ERROR })
    expect(validateFeedbackMessage('a'.repeat(2001))).toEqual({
      ok: false,
      error: LONG_FEEDBACK_ERROR,
    })
  })
})

describe('sanitizePagePath', () => {
  it.each([
    ['/photos?album=2#top', '/photos'],
    ['/reservations/calendar', '/reservations/calendar'],
    ['https://evil.example.com/x', '/'],
    ['//evil.example.com', '/'],
    ['photos', '/'],
    ['/a b\u0000c', '/abc'],
    [undefined, '/'],
    ['?q=1', '/'],
  ])('%s → %s', (raw, expected) => {
    expect(sanitizePagePath(raw)).toBe(expected)
  })
  it('caps the length', () => {
    expect(sanitizePagePath(`/${'a'.repeat(500)}`)).toHaveLength(300)
  })
})

describe('firstLineSummary', () => {
  it('uses the first non-empty line', () => {
    expect(firstLineSummary('\n\n  Dock light  \nmore')).toBe('Dock light')
  })
  it('truncates long lines with an ellipsis', () => {
    const s = firstLineSummary('word '.repeat(40))
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('…')).toBe(true)
  })
})

describe('summarizeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari 17 on iOS (phone)',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
      'Edge 128 on Windows (desktop)',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      'Firefox 130 on Linux (desktop)',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Safari/537.36',
      'Samsung Internet 25 on Android (tablet)',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1',
      'Chrome 128 on iPadOS (tablet)',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 OPR/110.0',
      'Opera 110 on ChromeOS (desktop)',
    ],
    ['curl/8.0', 'Unknown browser on an unknown system (desktop)'],
    [null, 'Unknown browser and device'],
  ])('%s', (ua, expected) => {
    expect(summarizeUserAgent(ua)).toBe(expected)
  })
})
