// Pure rules for what a member may submit (CAP-048 "Submission and Privacy
// Rules"). Shared by the Feedback panel and the API route so both give the
// same answer.

export const MAX_FEEDBACK_LENGTH = 2000
export const EMPTY_FEEDBACK_ERROR = 'Enter your feedback before sending.'
export const LONG_FEEDBACK_ERROR = 'Feedback must be 2,000 characters or shorter.'
export const FEEDBACK_UNAVAILABLE = 'Feedback could not be sent right now. Please try again later.'

export type MessageCheck = { ok: true; message: string } | { ok: false; error: string }

export function validateFeedbackMessage(raw: unknown): MessageCheck {
  const message = typeof raw === 'string' ? raw.trim() : ''
  if (message.length === 0) return { ok: false, error: EMPTY_FEEDBACK_ERROR }
  if (message.length > MAX_FEEDBACK_LENGTH) return { ok: false, error: LONG_FEEDBACK_ERROR }
  return { ok: true, message }
}

const MAX_PATH_LENGTH = 300

/**
 * The relative pathname where Feedback was opened. Query strings and fragments
 * are dropped (they can carry tokens or personal data); anything that isn't a
 * site-relative path becomes "/".
 */
export function sanitizePagePath(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  const path = raw.split(/[?#]/, 1)[0].trim()
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  const clean = path.replace(/[\u0000-\u001f\u007f\s]/g, '')
  return clean.slice(0, MAX_PATH_LENGTH) || '/'
}

/** A short subject-line summary of the first non-empty line of the message. */
export function firstLineSummary(message: string, max = 80): string {
  const line =
    message
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/(?:OPR|Opera)\/(\d+)/, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, 'Safari'],
]

function osName(ua: string): string {
  if (/iPad/.test(ua)) return 'iPadOS'
  if (/iPhone|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'an unknown system'
}

function deviceType(ua: string): string {
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet'
  if (/Mobi|iPhone|iPod/.test(ua)) return 'phone'
  return 'desktop'
}

/**
 * A readable browser/device summary such as "Chrome 128 on macOS (desktop)".
 * Only the summary reaches Jira, never the raw header.
 */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown browser and device'
  let browser = 'Unknown browser'
  for (const [pattern, name] of BROWSERS) {
    const m = ua.match(pattern)
    if (m) {
      browser = `${name} ${m[1]}`
      break
    }
  }
  return `${browser} on ${osName(ua)} (${deviceType(ua)})`
}
