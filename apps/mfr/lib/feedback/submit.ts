// Submitting Feedback: one Jira Task, then best-effort member and admin
// emails. Success depends only on Jira accepting the issue; nothing is stored
// in the MFR database.

import { logger } from '@/lib/reservations/logger'
import type { JiraFeedbackConfig } from './config'
import { adfParagraph, type AdfDoc } from './adf'
import { createFeedbackIssue, issueBrowseUrl } from './jira'
import { firstLineSummary } from './validation'
import { sendFeedbackAdminEmail, sendFeedbackReceivedEmail } from './notifications'

export interface FeedbackSubmission {
  memberName: string
  memberEmail: string
  message: string
  pagePath: string
  device: string
  submittedAt: Date
}

const MAX_SUMMARY = 255

export function feedbackSummary(memberName: string, message: string): string {
  return `Feedback from ${memberName}: ${firstLineSummary(message)}`.slice(0, MAX_SUMMARY)
}

export function feedbackDescription(s: FeedbackSubmission): AdfDoc {
  const details = [
    `Member: ${s.memberName} (${s.memberEmail})`,
    `Page: ${s.pagePath}`,
    `Device: ${s.device}`,
    `Submitted: ${s.submittedAt.toISOString()}`,
  ]
  return {
    type: 'doc',
    version: 1,
    content: [
      adfParagraph('Feedback message', true),
      adfParagraph(s.message),
      adfParagraph('Details', true),
      {
        type: 'bulletList',
        content: details.map((d) => ({ type: 'listItem', content: [adfParagraph(d)] })),
      },
    ],
  }
}

/** Creates the Jira issue (throws on failure), then sends the emails. */
export async function submitFeedback(
  config: JiraFeedbackConfig,
  s: FeedbackSubmission,
): Promise<{ issueKey: string }> {
  const { key } = await createFeedbackIssue(config, {
    summary: feedbackSummary(s.memberName, s.message),
    description: feedbackDescription(s),
    feedback: {
      memberEmail: s.memberEmail.toLowerCase(),
      memberName: s.memberName,
      message: s.message,
    },
  })

  try {
    const issueUrl = await issueBrowseUrl(config, key)
    await Promise.all([
      sendFeedbackReceivedEmail({ issueKey: key, memberEmail: s.memberEmail, message: s.message }),
      sendFeedbackAdminEmail({
        issueKey: key,
        issueUrl,
        memberName: s.memberName,
        memberEmail: s.memberEmail,
        pagePath: s.pagePath,
        message: s.message,
      }),
    ])
  } catch (err) {
    logger.error({ err, issueKey: key }, 'feedback: notification emails failed')
  }
  return { issueKey: key }
}
