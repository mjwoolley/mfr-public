// POST /api/feedback/jira-status — called by the Jira Automation rule on every
// status transition of an `mfr-feedback` Task, authenticated with
// `Authorization: Bearer $JIRA_FEEDBACK_WEBHOOK_SECRET`. Body:
//   { "issueKey": "KAN-12", "fromStatus": "To Do", "toStatus": "In Progress" }

import { timingSafeEqual } from 'node:crypto'
import { logger } from '@/lib/reservations/logger'
import { jiraFeedbackConfig, jiraWebhookSecret } from '@/lib/feedback/config'
import { handleStatusTransition, parseStatusTransition } from '@/lib/feedback/statusCallback'

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function POST(request: Request): Promise<Response> {
  const secret = jiraWebhookSecret()
  const config = jiraFeedbackConfig()
  if (!secret || !config) return Response.json({ error: 'Not configured' }, { status: 404 })
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    logger.warn('feedback status: rejected unauthenticated callback')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let transition
  try {
    transition = parseStatusTransition(await request.json())
  } catch {
    transition = null
  }
  if (!transition) return Response.json({ error: 'Invalid payload' }, { status: 400 })

  try {
    const outcome = await handleStatusTransition(config, transition)
    return Response.json({ outcome })
  } catch (err) {
    logger.error({ err, issueKey: transition.issueKey }, 'feedback status: Jira lookup failed')
    return Response.json({ error: 'Jira unavailable' }, { status: 502 })
  }
}
