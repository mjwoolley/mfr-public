import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adminReplyMailbox,
  feedbackReplyConfig,
  inboundWebhookSecret,
  jiraFeedbackConfig,
  jiraWebhookSecret,
} from './config'

afterEach(() => vi.unstubAllEnvs())

describe('feedback config', () => {
  it('is dormant until the Jira credentials are set', () => {
    vi.stubEnv('JIRA_FEEDBACK_CLOUD_ID', '')
    expect(jiraFeedbackConfig()).toBeNull()
    expect(feedbackReplyConfig()).toBeNull()
    expect(jiraWebhookSecret()).toBeNull()
    expect(inboundWebhookSecret()).toBeNull()
    expect(adminReplyMailbox()).toBeNull()
  })
  it('defaults the project, issue type and label', () => {
    vi.stubEnv('JIRA_FEEDBACK_CLOUD_ID', 'c')
    vi.stubEnv('JIRA_FEEDBACK_CLIENT_ID', 'id')
    vi.stubEnv('JIRA_FEEDBACK_CLIENT_SECRET', 's')
    vi.stubEnv('JIRA_FEEDBACK_CREATOR_ACCOUNT_ID', 'a')
    vi.stubEnv('FEEDBACK_REPLY_DOMAIN', ' Reply.Example.org ')
    vi.stubEnv('FEEDBACK_REPLY_TOKEN_SECRET', 't')
    expect(jiraFeedbackConfig()).toMatchObject({
      projectKey: 'KAN',
      issueType: 'Task',
      label: 'mfr-feedback',
    })
    expect(feedbackReplyConfig()).toEqual({ domain: 'reply.example.org', tokenSecret: 't' })
  })
})
