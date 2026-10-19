// The Jira Cloud client for Member Feedback. Authenticates as the MFR
// deployment's own OAuth 2.0 (client-credentials) service-account credential
// and talks to the v3 REST API through the api.atlassian.com gateway. Jira is
// the system of record: Feedback issues carry an `mfr-feedback` issue property
// holding the submitting member and the original message, so callbacks resolve
// everything from Jira without a local Feedback table.

import type { JiraFeedbackConfig } from './config'
import { adfToText, type AdfDoc } from './adf'

export const FEEDBACK_PROPERTY = 'mfr-feedback'
export const DELIVERY_PROPERTY = 'mfr-feedback-delivery'
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token'
const REQUEST_TIMEOUT_MS = 10_000

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'JiraError'
  }
}

/** What the site stored on the issue when it created it. */
export interface FeedbackProperty {
  memberEmail: string
  memberName: string
  message: string
}

export interface FeedbackIssue {
  key: string
  projectKey: string
  labels: string[]
  creatorAccountId: string | null
  status: string
  feedback: FeedbackProperty | null
}

export interface JiraComment {
  id: string
  text: string
  deliveryId: string | null
}

let cachedToken: { clientId: string; token: string; expiresAt: number } | null = null
let cachedBaseUrl: { cloudId: string; url: string } | null = null

/** Test hook: forget the cached token and site URL. */
export function resetJiraCache() {
  cachedToken = null
  cachedBaseUrl = null
}

async function accessToken(config: JiraFeedbackConfig): Promise<string> {
  if (
    cachedToken &&
    cachedToken.clientId === config.clientId &&
    cachedToken.expiresAt > Date.now()
  ) {
    return cachedToken.token
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new JiraError(`Jira token request failed (${res.status})`, res.status)
  const body = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new JiraError('Jira token response had no access_token')
  // Refresh a minute early so a token never expires mid-request.
  const ttlMs = Math.max((body.expires_in ?? 3600) - 60, 30) * 1000
  cachedToken = {
    clientId: config.clientId,
    token: body.access_token,
    expiresAt: Date.now() + ttlMs,
  }
  return body.access_token
}

async function jiraRequest<T>(
  config: JiraFeedbackConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await accessToken(config)
  const res = await fetch(`https://api.atlassian.com/ex/jira/${config.cloudId}/rest/api/3${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new JiraError(`Jira ${init.method ?? 'GET'} ${path} failed (${res.status})`, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * Creates one Feedback Task. Deliberately sets no assignee (assignment to
 * Devin is an explicit admin action) and only the configured label. Never
 * retried: a Jira failure is reported to the member instead.
 */
export async function createFeedbackIssue(
  config: JiraFeedbackConfig,
  input: { summary: string; description: AdfDoc; feedback: FeedbackProperty },
): Promise<{ key: string }> {
  const created = await jiraRequest<{ key?: string }>(config, '/issue', {
    method: 'POST',
    body: {
      fields: {
        project: { key: config.projectKey },
        issuetype: { name: config.issueType },
        summary: input.summary,
        description: input.description,
        labels: [config.label],
      },
      properties: [{ key: FEEDBACK_PROPERTY, value: input.feedback }],
    },
  })
  if (!created?.key) throw new JiraError('Jira did not return an issue key')
  return { key: created.key }
}

function asFeedbackProperty(value: unknown): FeedbackProperty | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.memberEmail !== 'string' || typeof v.message !== 'string') return null
  if (!v.memberEmail.trim() || !v.message.trim()) return null
  return {
    memberEmail: v.memberEmail.trim().toLowerCase(),
    memberName: typeof v.memberName === 'string' ? v.memberName : '',
    message: v.message,
  }
}

/** The issue's trust-relevant fields plus its Feedback property. */
export async function getFeedbackIssue(
  config: JiraFeedbackConfig,
  key: string,
): Promise<FeedbackIssue | null> {
  try {
    const issue = await jiraRequest<{
      key: string
      fields?: {
        project?: { key?: string }
        labels?: string[]
        creator?: { accountId?: string }
        status?: { name?: string }
      }
      properties?: Record<string, unknown>
    }>(
      config,
      `/issue/${encodeURIComponent(key)}?fields=project,labels,creator,status&properties=${FEEDBACK_PROPERTY}`,
    )
    return {
      key: issue.key,
      projectKey: issue.fields?.project?.key ?? '',
      labels: issue.fields?.labels ?? [],
      creatorAccountId: issue.fields?.creator?.accountId ?? null,
      status: issue.fields?.status?.name ?? '',
      feedback: asFeedbackProperty(issue.properties?.[FEEDBACK_PROPERTY]),
    }
  } catch (err) {
    if (err instanceof JiraError && err.status === 404) return null
    throw err
  }
}

/**
 * Only issues this site created may trigger email or accept replies: the
 * configured project, label and creator, plus a usable Feedback property.
 */
export function isSiteFeedbackIssue(
  issue: FeedbackIssue | null,
  config: JiraFeedbackConfig,
): issue is FeedbackIssue & { feedback: FeedbackProperty } {
  return (
    !!issue &&
    issue.projectKey === config.projectKey &&
    issue.labels.includes(config.label) &&
    issue.creatorAccountId === config.creatorAccountId &&
    issue.feedback !== null
  )
}

interface RawComment {
  id: string
  body?: unknown
  properties?: { key: string; value?: { deliveryId?: unknown } }[]
}

function toComment(c: RawComment): JiraComment {
  const delivery = c.properties?.find((p) => p.key === DELIVERY_PROPERTY)?.value?.deliveryId
  return {
    id: c.id,
    text: adfToText(c.body),
    deliveryId: typeof delivery === 'string' ? delivery : null,
  }
}

/** Every comment, oldest first, with any inbound delivery id attached. */
export async function listComments(
  config: JiraFeedbackConfig,
  key: string,
): Promise<JiraComment[]> {
  const comments: JiraComment[] = []
  for (let startAt = 0; ;) {
    const page = await jiraRequest<{ comments?: RawComment[]; total?: number }>(
      config,
      `/issue/${encodeURIComponent(key)}/comment?startAt=${startAt}&maxResults=100&orderBy=created&expand=properties`,
    )
    const batch = page.comments ?? []
    comments.push(...batch.map(toComment))
    startAt += batch.length
    if (batch.length === 0 || startAt >= (page.total ?? 0)) return comments
  }
}

/** The most recent comment's text, or null when there are none. */
export async function latestCommentText(
  config: JiraFeedbackConfig,
  key: string,
): Promise<string | null> {
  const page = await jiraRequest<{ comments?: RawComment[] }>(
    config,
    `/issue/${encodeURIComponent(key)}/comment?maxResults=1&orderBy=-created`,
  )
  const text = page.comments?.[0] ? toComment(page.comments[0]).text : ''
  return text.length > 0 ? text : null
}

/** Adds a comment tagged with the inbound delivery id (for replay detection). */
export async function addDeliveryComment(
  config: JiraFeedbackConfig,
  key: string,
  body: AdfDoc,
  deliveryId: string,
): Promise<void> {
  await jiraRequest(config, `/issue/${encodeURIComponent(key)}/comment`, {
    method: 'POST',
    body: { body, properties: [{ key: DELIVERY_PROPERTY, value: { deliveryId } }] },
  })
}

/** The human-facing browse URL for an issue (for admin emails only). */
export async function issueBrowseUrl(
  config: JiraFeedbackConfig,
  key: string,
): Promise<string | null> {
  try {
    if (!cachedBaseUrl || cachedBaseUrl.cloudId !== config.cloudId) {
      const info = await jiraRequest<{ baseUrl?: string }>(config, '/serverInfo')
      if (!info.baseUrl) return null
      cachedBaseUrl = { cloudId: config.cloudId, url: info.baseUrl.replace(/\/+$/, '') }
    }
    return `${cachedBaseUrl.url}/browse/${encodeURIComponent(key)}`
  } catch {
    return null
  }
}
