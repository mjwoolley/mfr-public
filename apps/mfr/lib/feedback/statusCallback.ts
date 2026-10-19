// Jira Automation → member status email. The callback payload is only trusted
// for the transition (from/to status); everything about the member comes from
// the issue itself, which must be site-created Feedback.

import { logger } from '@/lib/reservations/logger'
import type { JiraFeedbackConfig } from './config'
import { getFeedbackIssue, isSiteFeedbackIssue, latestCommentText } from './jira'
import { findApprovedMember } from './members'
import { sendFeedbackStatusEmail } from './notifications'

export interface StatusTransition {
  issueKey: string
  fromStatus: string | null
  toStatus: string
}

export type StatusOutcome =
  'sent' | 'email-failed' | 'no-status-change' | 'not-site-feedback' | 'member-not-approved'

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/

export function parseStatusTransition(body: unknown): StatusTransition | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const issueKey = typeof b.issueKey === 'string' ? b.issueKey.trim().toUpperCase() : ''
  const toStatus = typeof b.toStatus === 'string' ? b.toStatus.trim() : ''
  const fromStatus = typeof b.fromStatus === 'string' ? b.fromStatus.trim() : ''
  if (!ISSUE_KEY.test(issueKey) || !toStatus) return null
  return { issueKey, toStatus, fromStatus: fromStatus || null }
}

export function isDoneStatus(status: string): boolean {
  return status.trim().toLowerCase() === 'done'
}

export async function handleStatusTransition(
  config: JiraFeedbackConfig,
  t: StatusTransition,
): Promise<StatusOutcome> {
  // A "transition" into the same status (or an edit replayed as one) is not a
  // status change.
  if (t.fromStatus && t.fromStatus.toLowerCase() === t.toStatus.toLowerCase()) {
    return 'no-status-change'
  }

  const issue = await getFeedbackIssue(config, t.issueKey)
  if (!isSiteFeedbackIssue(issue, config)) {
    logger.warn({ issueKey: t.issueKey }, 'feedback status: not site-created Feedback, ignored')
    return 'not-site-feedback'
  }
  const member = await findApprovedMember(issue.feedback.memberEmail)
  if (!member) {
    logger.warn({ issueKey: t.issueKey }, 'feedback status: member is not approved, ignored')
    return 'member-not-approved'
  }

  const resolutionNote = isDoneStatus(t.toStatus)
    ? await latestCommentText(config, issue.key)
    : null
  const sent = await sendFeedbackStatusEmail({
    issueKey: issue.key,
    memberEmail: issue.feedback.memberEmail,
    message: issue.feedback.message,
    status: t.toStatus,
    resolutionNote,
  })
  return sent ? 'sent' : 'email-failed'
}
