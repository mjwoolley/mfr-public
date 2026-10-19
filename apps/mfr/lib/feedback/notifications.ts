// Feedback emails. All go through the portal's SES sender, so CAP-010's
// non-production redirection and log-on-failure rules apply. Each returns
// whether SES accepted the message; none throws.

import { createElement } from 'react'
import { sendEmail } from '@/lib/reservations/email'
import { logger } from '@/lib/reservations/logger'
import {
  FeedbackAdminNotification,
  FeedbackReceived,
  FeedbackReplyForward,
  FeedbackStatusUpdate,
} from '@/emails/portal/FeedbackEmails'
import { adminReplyMailbox, feedbackReplyConfig } from './config'
import { replyAddressFor } from './replyAddress'
import { listSiteAdminEmails } from './members'

/**
 * Where a member's reply should go: the issue-specific inbound address, or the
 * site-admin mailbox while inbound replies are not configured.
 */
export function memberReplyTo(issueKey: string, memberEmail: string): string | undefined {
  const reply = feedbackReplyConfig()
  if (reply) return replyAddressFor(reply, issueKey, memberEmail)
  return adminReplyMailbox() ?? undefined
}

export async function sendFeedbackReceivedEmail(input: {
  issueKey: string
  memberEmail: string
  message: string
}): Promise<boolean> {
  return sendEmail({
    to: input.memberEmail,
    subject: `We received your Feedback (${input.issueKey})`,
    replyTo: memberReplyTo(input.issueKey, input.memberEmail),
    react: createElement(FeedbackReceived, { issueKey: input.issueKey, message: input.message }),
  })
}

export async function sendFeedbackAdminEmail(input: {
  issueKey: string
  issueUrl: string | null
  memberName: string
  memberEmail: string
  pagePath: string
  message: string
}): Promise<boolean> {
  let recipients: string[]
  try {
    recipients = await listSiteAdminEmails()
  } catch (err) {
    logger.error({ err, issueKey: input.issueKey }, 'feedback: could not list site admins')
    return false
  }
  if (recipients.length === 0) {
    logger.warn({ issueKey: input.issueKey }, 'feedback: no site admins to notify')
    return false
  }
  const [to, ...cc] = recipients
  return sendEmail({
    to,
    cc,
    subject: `New Feedback from ${input.memberName} (${input.issueKey})`,
    replyTo: input.memberEmail,
    react: createElement(FeedbackAdminNotification, input),
  })
}

export async function sendFeedbackStatusEmail(input: {
  issueKey: string
  memberEmail: string
  message: string
  status: string
  resolutionNote: string | null
}): Promise<boolean> {
  return sendEmail({
    to: input.memberEmail,
    subject: `Your Feedback ${input.issueKey} is now ${input.status}`,
    replyTo: memberReplyTo(input.issueKey, input.memberEmail),
    react: createElement(FeedbackStatusUpdate, {
      issueKey: input.issueKey,
      message: input.message,
      status: input.status,
      resolutionNote: input.resolutionNote,
    }),
  })
}

export async function forwardReplyToAdmins(input: {
  issueKey: string
  memberName: string
  memberEmail: string
  reply: string
  deliveryId: string
}): Promise<boolean> {
  const mailbox = adminReplyMailbox()
  if (!mailbox) {
    logger.error({ issueKey: input.issueKey }, 'feedback: FEEDBACK_REPLY_TO is not set')
    return false
  }
  return sendEmail({
    to: mailbox,
    subject: `Re: Feedback ${input.issueKey} from ${input.memberName}`,
    replyTo: input.memberEmail,
    react: createElement(FeedbackReplyForward, input),
  })
}
