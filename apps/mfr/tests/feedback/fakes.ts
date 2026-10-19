// In-memory stand-ins for the services Member Feedback talks to over HTTP:
// Jira Cloud (OAuth token + v3 REST) and Amazon SNS (signing certificate).
// Installed as the global fetch so the real client code runs unmodified.

import { generateKeyPairSync, createSign } from 'node:crypto'
import { snsStringToSign, type SnsMessage } from '@/lib/feedback/inbound'

export const JIRA_ENV = {
  JIRA_FEEDBACK_CLOUD_ID: 'cloud-1',
  JIRA_FEEDBACK_PROJECT_KEY: 'KAN',
  JIRA_FEEDBACK_ISSUE_TYPE: 'Task',
  JIRA_FEEDBACK_LABEL: 'mfr-feedback',
  JIRA_FEEDBACK_CLIENT_ID: 'client-id',
  JIRA_FEEDBACK_CLIENT_SECRET: 'client-secret',
  JIRA_FEEDBACK_CREATOR_ACCOUNT_ID: 'mfr-bot',
  JIRA_FEEDBACK_WEBHOOK_SECRET: 'jira-hook-secret',
  FEEDBACK_REPLY_DOMAIN: 'reply.example.org',
  FEEDBACK_REPLY_TOKEN_SECRET: 'reply-token-secret',
  FEEDBACK_INBOUND_WEBHOOK_SECRET: 'inbound-secret',
  FEEDBACK_REPLY_TO: 'admins@example.org',
}

export interface FakeIssue {
  key: string
  fields: {
    project: { key: string }
    issuetype: { name: string }
    summary: string
    description: unknown
    labels: string[]
    assignee?: unknown
    creator: { accountId: string }
    status: { name: string }
  }
  properties: Record<string, unknown>
  comments: { id: string; body: unknown; properties?: { key: string; value: unknown }[] }[]
  createRequest?: Record<string, unknown>
}

export interface FakeJira {
  issues: Map<string, FakeIssue>
  createAttempts: number
  failCreate: boolean
  failComment: boolean
  failLookup: boolean
  addIssue(issue: Partial<FakeIssue> & { key: string }): FakeIssue
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const CERT_URL = 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem'
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PUBLIC_PEM = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()

export function fakeJira(): FakeJira {
  let next = 100
  const jira: FakeJira = {
    issues: new Map(),
    createAttempts: 0,
    failCreate: false,
    failComment: false,
    failLookup: false,
    addIssue(issue) {
      const full: FakeIssue = {
        key: issue.key,
        fields: {
          project: { key: 'KAN' },
          issuetype: { name: 'Task' },
          summary: 'Feedback',
          description: null,
          labels: ['mfr-feedback'],
          creator: { accountId: 'mfr-bot' },
          status: { name: 'To Do' },
          ...issue.fields,
        },
        properties: issue.properties ?? {},
        comments: issue.comments ?? [],
      }
      jira.issues.set(full.key, full)
      return full
    },
  }
  return Object.assign(jira, { next: () => `KAN-${++next}` }) as FakeJira & { next: () => string }
}

/** Installs fetch handling the Jira API, the SNS cert and SNS subscription confirmation. */
export function installFetch(jira: FakeJira & { next?: () => string }) {
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    )
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (url.href === CERT_URL) return new Response(PUBLIC_PEM)
    if (url.hostname === 'auth.atlassian.com')
      return json({ access_token: 'tok', expires_in: 3600 })
    if (url.hostname.startsWith('sns.')) return new Response('<ok/>')
    const m = url.pathname.match(/^\/ex\/jira\/cloud-1\/rest\/api\/3(\/.*)$/)
    if (!m) return new Response('unexpected', { status: 599 })
    const path = m[1]
    if (path === '/serverInfo') return json({ baseUrl: 'https://mfr.atlassian.net' })
    if (path === '/issue' && method === 'POST') {
      jira.createAttempts++
      if (jira.failCreate) return json({ errorMessages: ['down'] }, 503)
      const key = (jira as { next: () => string }).next()
      const issue = jira.addIssue({
        key,
        fields: {
          ...body.fields,
          creator: { accountId: 'mfr-bot' },
          status: { name: 'To Do' },
        },
        properties: Object.fromEntries(
          (body.properties ?? []).map((p: { key: string; value: unknown }) => [p.key, p.value]),
        ),
      })
      issue.createRequest = body
      return json({ id: '1', key }, 201)
    }
    const im = path.match(/^\/issue\/([^/]+)(\/comment)?$/)
    if (im) {
      if (jira.failLookup) return json({}, 503)
      const issue = jira.issues.get(decodeURIComponent(im[1]))
      if (!issue) return json({ errorMessages: ['not found'] }, 404)
      if (!im[2]) {
        const wanted = url.searchParams.get('properties')
        return json({
          key: issue.key,
          fields: issue.fields,
          properties:
            wanted && wanted in issue.properties ? { [wanted]: issue.properties[wanted] } : {},
        })
      }
      if (method === 'POST') {
        if (jira.failComment) return json({}, 503)
        issue.comments.push({ id: String(issue.comments.length + 1), ...body })
        return json({ id: String(issue.comments.length) }, 201)
      }
      const desc = url.searchParams.get('orderBy') === '-created'
      const list = desc ? [...issue.comments].reverse() : issue.comments
      const startAt = Number(url.searchParams.get('startAt') ?? 0)
      const max = Number(url.searchParams.get('maxResults') ?? 50)
      return json({ comments: list.slice(startAt, startAt + max), total: list.length })
    }
    return new Response('unexpected', { status: 599 })
  }
  return handler
}

export function signSns(
  fields: Omit<SnsMessage, 'Signature' | 'SignatureVersion' | 'SigningCertURL'>,
): SnsMessage {
  const message = {
    ...fields,
    SignatureVersion: '2',
    SigningCertURL: CERT_URL,
    Signature: '',
  } as SnsMessage
  message.Signature = createSign('RSA-SHA256')
    .update(snsStringToSign(message))
    .sign(keys.privateKey, 'base64')
  return message
}

/** A raw RFC 5322 reply as SES would deliver it. */
export function rawEmail(opts: {
  from: string
  to: string
  text?: string
  headers?: Record<string, string>
  subject?: string
}): string {
  const extra = Object.entries(opts.headers ?? {}).map(([k, v]) => `${k}: ${v}\r\n`)
  return (
    `From: ${opts.from}\r\nTo: ${opts.to}\r\nSubject: ${opts.subject ?? 'Re: Your Feedback'}\r\n` +
    `Message-ID: <abc@mail.example.com>\r\n${extra.join('')}` +
    `Content-Type: text/plain; charset=utf-8\r\n\r\n${(opts.text ?? '').replace(/\n/g, '\r\n')}`
  )
}

export function sesReceipt(opts: {
  mime: string
  messageId?: string
  source?: string
  recipients: string[]
  dmarc?: string
  dkim?: string
  spam?: string
}) {
  return {
    notificationType: 'Received',
    mail: { messageId: opts.messageId ?? 'ses-msg-1', source: opts.source ?? 'ann@example.com' },
    receipt: {
      recipients: opts.recipients,
      spfVerdict: { status: 'PASS' },
      dkimVerdict: { status: opts.dkim ?? 'PASS' },
      dmarcVerdict: { status: opts.dmarc ?? 'PASS' },
      spamVerdict: { status: opts.spam ?? 'PASS' },
      virusVerdict: { status: 'PASS' },
      action: { type: 'SNS', encoding: 'BASE64' },
    },
    content: Buffer.from(opts.mime).toString('base64'),
  }
}

export function snsNotification(receipt: unknown, overrides: Partial<SnsMessage> = {}): SnsMessage {
  return signSns({
    Type: 'Notification',
    MessageId: 'sns-1',
    TopicArn: 'arn:aws:sns:us-east-1:123:mfr-feedback-replies',
    Message: JSON.stringify(receipt),
    Timestamp: new Date().toISOString(),
    ...overrides,
  })
}
