// POST /api/feedback/email-reply?token=… — the SNS HTTPS subscription for SES
// inbound mail at FEEDBACK_REPLY_DOMAIN. The token must equal
// FEEDBACK_INBOUND_WEBHOOK_SECRET and every message must carry a valid, fresh
// SNS signature. Valid messages always get 200 so SNS does not redeliver;
// per-destination failures are logged with the delivery id for recovery.

import { timingSafeEqual } from 'node:crypto'
import { logger } from '@/lib/reservations/logger'
import {
  feedbackReplyConfig,
  inboundWebhookSecret,
  jiraFeedbackConfig,
} from '@/lib/feedback/config'
import {
  handleInboundReply,
  isFresh,
  isTrustedCertUrl,
  parseSnsMessage,
  verifySnsSignature,
  type SesReceipt,
} from '@/lib/feedback/inbound'

function tokenMatches(given: string | null, secret: string): boolean {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request): Promise<Response> {
  const secret = inboundWebhookSecret()
  const jira = jiraFeedbackConfig()
  const reply = feedbackReplyConfig()
  if (!secret || !jira || !reply) return Response.json({ error: 'Not configured' }, { status: 404 })
  if (!tokenMatches(new URL(request.url).searchParams.get('token'), secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let message
  try {
    // SNS posts JSON with Content-Type text/plain.
    message = parseSnsMessage(JSON.parse(await request.text()))
  } catch {
    message = null
  }
  if (!message) return Response.json({ error: 'Invalid payload' }, { status: 400 })
  if (!isFresh(message) || !(await verifySnsSignature(message))) {
    logger.warn({ messageId: message.MessageId }, 'feedback reply: rejected SNS message')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (message.Type === 'SubscriptionConfirmation') {
    if (!message.SubscribeURL || !isTrustedCertUrl(message.SigningCertURL)) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const confirm = new URL(message.SubscribeURL)
    if (
      confirm.protocol !== 'https:' ||
      !/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(confirm.hostname)
    ) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 })
    }
    await fetch(confirm, { signal: AbortSignal.timeout(5000) })
    logger.info({ topic: message.TopicArn }, 'feedback reply: SNS subscription confirmed')
    return Response.json({ ok: true })
  }
  if (message.Type !== 'Notification') return Response.json({ ok: true })

  let receipt: SesReceipt
  try {
    receipt = JSON.parse(message.Message) as SesReceipt
  } catch {
    return Response.json({ ok: true, outcome: 'ignored' })
  }
  try {
    const outcome = await handleInboundReply(jira, reply, receipt)
    return Response.json({ ok: true, outcome: outcome.kind })
  } catch (err) {
    // Jira lookups failed before anything was delivered: let SNS retry.
    logger.error({ err, deliveryId: receipt.mail?.messageId }, 'feedback reply: processing failed')
    return Response.json({ error: 'Temporarily unavailable' }, { status: 503 })
  }
}
