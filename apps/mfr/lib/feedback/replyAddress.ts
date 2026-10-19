// Issue-specific Reply-To addresses for member emails. The local part carries
// the issue key plus an HMAC binding it to the original member's email, so a
// reply can be routed without a local mapping and the address cannot be
// altered to point at another issue or member:
//
//   feedback+kan-123-<mac>@reply.example.org
//
// Everything is lowercase because some mail systems fold local-part case.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FeedbackReplyConfig } from './config'

const PREFIX = 'feedback+'
const MAC_LENGTH = 26

function mac(secret: string, issueKey: string, memberEmail: string): string {
  return createHmac('sha256', secret)
    .update(`${issueKey.toUpperCase()}\n${memberEmail.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, MAC_LENGTH)
}

export function replyAddressFor(
  config: FeedbackReplyConfig,
  issueKey: string,
  memberEmail: string,
): string {
  const key = issueKey.toLowerCase()
  return `${PREFIX}${key}-${mac(config.tokenSecret, issueKey, memberEmail)}@${config.domain}`
}

/**
 * The issue key and MAC from a reply address at the configured domain, or null
 * when it isn't one of ours. The MAC is checked separately, against the member
 * Jira says owns the issue.
 */
export function parseReplyAddress(
  config: FeedbackReplyConfig,
  address: string,
): { issueKey: string; mac: string } | null {
  const lower = address.trim().toLowerCase()
  const at = lower.lastIndexOf('@')
  if (at === -1 || lower.slice(at + 1) !== config.domain) return null
  const local = lower.slice(0, at)
  if (!local.startsWith(PREFIX)) return null
  const m = local.slice(PREFIX.length).match(/^([a-z][a-z0-9_]*-\d+)-([0-9a-f]+)$/)
  if (!m || m[2].length !== MAC_LENGTH) return null
  return { issueKey: m[1].toUpperCase(), mac: m[2] }
}

export function replyMacMatches(
  config: FeedbackReplyConfig,
  issueKey: string,
  memberEmail: string,
  candidate: string,
): boolean {
  const expected = Buffer.from(mac(config.tokenSecret, issueKey, memberEmail))
  const given = Buffer.from(candidate)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
