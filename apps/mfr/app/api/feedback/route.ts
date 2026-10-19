// POST /api/feedback — an approved member submits Feedback (CAP-048). Creates
// one Jira Task; emails are best-effort. Jira failures are reported (never
// retried) so the member can try again later with their draft intact.

import { requireApprovedUser } from '@/lib/reservations/auth/requireApprovedUser'
import { logger } from '@/lib/reservations/logger'
import { jiraFeedbackConfig } from '@/lib/feedback/config'
import { submitFeedback } from '@/lib/feedback/submit'
import {
  FEEDBACK_UNAVAILABLE,
  sanitizePagePath,
  summarizeUserAgent,
  validateFeedbackMessage,
} from '@/lib/feedback/validation'

export async function POST(request: Request): Promise<Response> {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response
  const user = auth.session.user

  let body: { message?: unknown; pagePath?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const check = validateFeedbackMessage(body?.message)
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 })

  const config = jiraFeedbackConfig()
  if (!config || !user.email) {
    logger.error({ configured: !!config }, 'feedback: submission unavailable')
    return Response.json({ error: FEEDBACK_UNAVAILABLE }, { status: 503 })
  }

  try {
    await submitFeedback(config, {
      memberName: user.name?.trim() || user.email,
      memberEmail: user.email,
      message: check.message,
      pagePath: sanitizePagePath(body?.pagePath),
      device: summarizeUserAgent(request.headers.get('user-agent')),
      submittedAt: new Date(),
    })
  } catch (err) {
    logger.error({ err }, 'feedback: Jira issue creation failed')
    return Response.json({ error: FEEDBACK_UNAVAILABLE }, { status: 502 })
  }
  // The issue key stays out of the response: members get it by email.
  return Response.json({ ok: true })
}
