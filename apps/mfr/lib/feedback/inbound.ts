// Inbound member replies: Amazon SES email receiving publishes each message to
// an SNS topic, and SNS POSTs it to /api/feedback/email-reply. Before a reply
// touches Jira or the admin mailbox we check, in order: the SNS signature and
// age; SES's sender-authentication verdicts; that it isn't a bounce,
// auto-response or site-generated message; the tamper-proof reply address;
// the issue in Jira (project, label, creator, member); and that the sender is
// that member and still approved. Each delivery's SES message id is stored on
// the Jira comment so a redelivered message is ignored.

import { createVerify } from 'node:crypto'
import PostalMime from 'postal-mime'
import { logger } from '@/lib/reservations/logger'
import type { FeedbackReplyConfig, JiraFeedbackConfig } from './config'
import { adfFromText, type AdfDoc } from './adf'
import { addDeliveryComment, getFeedbackIssue, isSiteFeedbackIssue, listComments } from './jira'
import { findApprovedMember } from './members'
import { forwardReplyToAdmins } from './notifications'
import { parseReplyAddress, replyMacMatches } from './replyAddress'
import { extractReplyText, htmlToText } from './replyText'

// ---------------------------------------------------------------- SNS

export interface SnsMessage {
  Type: string
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL: string
  Subject?: string
  SubscribeURL?: string
  Token?: string
}

/** SNS retries for up to about an hour; anything older is a replay. */
export const MAX_MESSAGE_AGE_MS = 60 * 60 * 1000
const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/

export function parseSnsMessage(body: unknown): SnsMessage | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const required = [
    'Type',
    'MessageId',
    'TopicArn',
    'Message',
    'Timestamp',
    'SignatureVersion',
    'Signature',
    'SigningCertURL',
  ]
  if (!required.every((k) => typeof b[k] === 'string')) return null
  return b as unknown as SnsMessage
}

export function isTrustedCertUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && CERT_HOST.test(u.hostname) && u.pathname.endsWith('.pem')
  } catch {
    return false
  }
}

/** The canonical string SNS signs (see AWS "Verifying SNS message signatures"). */
export function snsStringToSign(m: SnsMessage): string {
  const keys =
    m.Type === 'Notification'
      ? [
          'Message',
          'MessageId',
          ...(m.Subject !== undefined ? ['Subject'] : []),
          'Timestamp',
          'TopicArn',
          'Type',
        ]
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
  return keys.map((k) => `${k}\n${(m as unknown as Record<string, string>)[k] ?? ''}\n`).join('')
}

const certCache = new Map<string, string>()

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url)
  if (cached) return cached
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`SNS certificate fetch failed (${res.status})`)
  const pem = await res.text()
  certCache.set(url, pem)
  return pem
}

export async function verifySnsSignature(
  m: SnsMessage,
  getCert: (url: string) => Promise<string> = fetchCert,
): Promise<boolean> {
  if (!isTrustedCertUrl(m.SigningCertURL)) return false
  const algorithm =
    m.SignatureVersion === '2' ? 'RSA-SHA256' : m.SignatureVersion === '1' ? 'RSA-SHA1' : null
  if (!algorithm) return false
  try {
    const cert = await getCert(m.SigningCertURL)
    return createVerify(algorithm)
      .update(snsStringToSign(m), 'utf8')
      .verify(cert, m.Signature, 'base64')
  } catch (err) {
    logger.warn({ err }, 'feedback reply: SNS signature check failed')
    return false
  }
}

export function isFresh(m: SnsMessage, now = Date.now()): boolean {
  const sent = Date.parse(m.Timestamp)
  return Number.isFinite(sent) && now - sent <= MAX_MESSAGE_AGE_MS && sent - now <= 5 * 60 * 1000
}

// ---------------------------------------------------------------- SES

interface Verdict {
  status?: string
}

export interface SesReceipt {
  notificationType?: string
  mail?: { messageId?: string; source?: string }
  receipt?: {
    recipients?: string[]
    spfVerdict?: Verdict
    dkimVerdict?: Verdict
    dmarcVerdict?: Verdict
    spamVerdict?: Verdict
    virusVerdict?: Verdict
    action?: { type?: string; encoding?: string }
  }
  content?: string
}

const status = (v?: Verdict) => (v?.status ?? '').toUpperCase()

/**
 * The From domain must pass DMARC. A bare DKIM pass is not enough: SES's
 * receipt verdict only says *some* signature verified, not that the signing
 * domain is aligned with the From header, so any DKIM-signing relay could
 * spoof a member at a domain with no DMARC policy. Spam and virus failures
 * are rejected outright.
 */
export function senderAuthenticated(r: SesReceipt['receipt']): boolean {
  if (!r) return false
  if (status(r.spamVerdict) === 'FAIL' || status(r.virusVerdict) === 'FAIL') return false
  return status(r.dmarcVerdict) === 'PASS'
}

export function rawMime(n: SesReceipt): string | null {
  if (typeof n.content !== 'string') return null
  return n.receipt?.action?.encoding?.toUpperCase() === 'BASE64'
    ? Buffer.from(n.content, 'base64').toString('utf8')
    : n.content
}

// ---------------------------------------------------------------- Reply

export interface ParsedReply {
  from: string
  replyAddress: string | null
  text: string
  automated: boolean
}

type Header = { key: string; value: string }

/** Bounces, vacation responders, mailing lists and our own notifications. */
export function isAutomated(
  headers: Header[],
  from: string,
  envelopeSender: string,
  contentType: string,
): boolean {
  const h = (k: string) =>
    headers
      .find((x) => x.key === k)
      ?.value.trim()
      .toLowerCase() ?? ''
  if (
    !envelopeSender ||
    envelopeSender === '<>' ||
    /mailer-daemon|postmaster/i.test(envelopeSender)
  )
    return true
  if (/mailer-daemon|postmaster/i.test(from)) return true
  if (contentType.toLowerCase().startsWith('multipart/report')) return true
  const autoSubmitted = h('auto-submitted')
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (/^(bulk|junk|list|auto_reply)$/.test(h('precedence'))) return true
  if (h('x-autoreply') || h('x-autorespond') || h('x-auto-response-suppress').includes('all'))
    return true
  const siteSender = (process.env.EMAIL_FROM ?? 'hello@millerfamilyreunions.org').toLowerCase()
  return from === siteSender
}

export async function parseReplyEmail(
  mime: string,
  envelopeSender: string,
  recipients: string[],
  config: FeedbackReplyConfig,
): Promise<ParsedReply> {
  const email = await PostalMime.parse(mime)
  const from = (email.from?.address ?? '').trim().toLowerCase()
  const contentType = email.headers.find((h) => h.key === 'content-type')?.value ?? ''
  const candidates = [...recipients, ...(email.to ?? []).map((a) => a.address ?? '')]
  const replyAddress = candidates.find((a) => parseReplyAddress(config, a)) ?? null
  const body = email.text ?? (email.html ? htmlToText(email.html) : '')
  return {
    from,
    replyAddress,
    text: extractReplyText(body),
    automated: isAutomated(email.headers, from, envelopeSender.trim(), contentType),
  }
}

export function replyCommentBody(
  memberName: string,
  memberEmail: string,
  reply: string,
  deliveryId: string,
): AdfDoc {
  return adfFromText(
    `Email reply from member ${memberName || memberEmail} <${memberEmail}>:\n\n${reply}\n\nInbound delivery: ${deliveryId}`,
  )
}

export type ReplyOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'duplicate' }
  | { kind: 'delivered'; jira: boolean; forwarded: boolean }

/** Routes one authenticated SES receipt. Never throws for a bad message. */
export async function handleInboundReply(
  jira: JiraFeedbackConfig,
  reply: FeedbackReplyConfig,
  n: SesReceipt,
): Promise<ReplyOutcome> {
  const ignored = (reason: string): ReplyOutcome => {
    logger.warn({ deliveryId: n.mail?.messageId, reason }, 'feedback reply: ignored')
    return { kind: 'ignored', reason }
  }
  const deliveryId = n.mail?.messageId
  if (n.notificationType !== 'Received' || !deliveryId) return ignored('not an SES receipt')
  if (!senderAuthenticated(n.receipt)) return ignored('sender not authenticated')
  const mime = rawMime(n)
  if (!mime) return ignored('no message content')

  const parsed = await parseReplyEmail(
    mime,
    n.mail?.source ?? '',
    n.receipt?.recipients ?? [],
    reply,
  )
  if (parsed.automated) return ignored('automated or site-generated message')
  const route = parsed.replyAddress ? parseReplyAddress(reply, parsed.replyAddress) : null
  if (!route) return ignored('no Feedback reply address')
  if (!parsed.text) return ignored('empty reply')

  const issue = await getFeedbackIssue(jira, route.issueKey)
  if (!isSiteFeedbackIssue(issue, jira)) return ignored('not site-created Feedback')
  const memberEmail = issue.feedback.memberEmail
  if (!replyMacMatches(reply, issue.key, memberEmail, route.mac))
    return ignored('reply address tampered')
  if (parsed.from !== memberEmail) return ignored('sender is not the original member')
  const member = await findApprovedMember(memberEmail)
  if (!member) return ignored('member is no longer approved')

  const comments = await listComments(jira, issue.key)
  if (comments.some((c) => c.deliveryId === deliveryId)) {
    logger.info({ deliveryId, issueKey: issue.key }, 'feedback reply: duplicate delivery ignored')
    return { kind: 'duplicate' }
  }

  const memberName = member.name || issue.feedback.memberName
  // Two independent deliveries: a failure at one never undoes the other.
  const [jiraResult, forwarded] = await Promise.all([
    addDeliveryComment(
      jira,
      issue.key,
      replyCommentBody(memberName, memberEmail, parsed.text, deliveryId),
      deliveryId,
    ).then(
      () => true,
      (err) => {
        logger.error(
          { err, deliveryId, issueKey: issue.key, destination: 'jira' },
          'feedback reply: Jira comment failed',
        )
        return false
      },
    ),
    forwardReplyToAdmins({
      issueKey: issue.key,
      memberName,
      memberEmail,
      reply: parsed.text,
      deliveryId,
    }),
  ])
  if (!forwarded) {
    logger.error(
      { deliveryId, issueKey: issue.key, destination: 'admin-mailbox' },
      'feedback reply: forward failed',
    )
  }
  return { kind: 'delivered', jira: jiraResult, forwarded }
}
