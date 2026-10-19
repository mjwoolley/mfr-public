// Deployment configuration for CAP-048 Member Feedback. Every value is
// server-only. Jira Feedback is dormant until the Jira credentials are set
// (Preview leaves them unset so testing never creates Tasks on the live board);
// member email replies are dormant until the reply domain and secrets are set.

export interface JiraFeedbackConfig {
  cloudId: string
  projectKey: string
  issueType: string
  label: string
  clientId: string
  clientSecret: string
  creatorAccountId: string
}

export interface FeedbackReplyConfig {
  domain: string
  tokenSecret: string
}

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

/** The Jira settings, or null when Feedback is not configured here. */
export function jiraFeedbackConfig(): JiraFeedbackConfig | null {
  const config = {
    cloudId: env('JIRA_FEEDBACK_CLOUD_ID'),
    projectKey: env('JIRA_FEEDBACK_PROJECT_KEY') || 'KAN',
    issueType: env('JIRA_FEEDBACK_ISSUE_TYPE') || 'Task',
    label: env('JIRA_FEEDBACK_LABEL') || 'mfr-feedback',
    clientId: env('JIRA_FEEDBACK_CLIENT_ID'),
    clientSecret: env('JIRA_FEEDBACK_CLIENT_SECRET'),
    creatorAccountId: env('JIRA_FEEDBACK_CREATOR_ACCOUNT_ID'),
  }
  if (!config.cloudId || !config.clientId || !config.clientSecret || !config.creatorAccountId) {
    return null
  }
  return config
}

/** Issue-specific Reply-To settings, or null when member replies are off. */
export function feedbackReplyConfig(): FeedbackReplyConfig | null {
  const domain = env('FEEDBACK_REPLY_DOMAIN').toLowerCase()
  const tokenSecret = env('FEEDBACK_REPLY_TOKEN_SECRET')
  return domain && tokenSecret ? { domain, tokenSecret } : null
}

/** Shared secret the Jira Automation rule sends as `Authorization: Bearer`. */
export function jiraWebhookSecret(): string | null {
  return env('JIRA_FEEDBACK_WEBHOOK_SECRET') || null
}

/** Token carried in the inbound-email (SNS) subscription URL. */
export function inboundWebhookSecret(): string | null {
  return env('FEEDBACK_INBOUND_WEBHOOK_SECRET') || null
}

/**
 * The SNS topic SES publishes inbound replies to. Required for the reply
 * route: notifications from any other (even AWS-signed) topic are rejected.
 */
export function inboundTopicArn(): string | null {
  return env('FEEDBACK_SNS_TOPIC_ARN') || null
}

/** The site-admin mailbox that member replies are forwarded to. */
export function adminReplyMailbox(): string | null {
  return env('FEEDBACK_REPLY_TO') || null
}
