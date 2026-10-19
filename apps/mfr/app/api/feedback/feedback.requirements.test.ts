// Requirement coverage for CAP-048 Member Feedback
// (requirements/portal/member-feedback.md): the three server endpoints —
// submission, the Jira status callback and the inbound email-reply webhook —
// driven end to end against an in-memory Jira and a signed SNS feed. Only the
// session, the identity lookups and the SES transport are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@react-email/render'
import type { ReactElement } from 'react'
import {
  JIRA_ENV,
  fakeJira,
  installFetch,
  rawEmail,
  sesReceipt,
  snsNotification,
  type FakeJira,
} from '@/tests/feedback/fakes'

const { authMock, sendEmailMock, loggerMock, membersMock, dbTouched } = vi.hoisted(() => ({
  authMock: vi.fn(),
  sendEmailMock: vi.fn(),
  loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  membersMock: { findApprovedMember: vi.fn(), listSiteAdminEmails: vi.fn() },
  dbTouched: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/reservations/email', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/reservations/logger', () => ({ logger: loggerMock }))
vi.mock('@/lib/feedback/members', () => membersMock)
// Any database access at all would be a Feedback record the spec forbids.
vi.mock('@/lib/portalDb', () => ({
  portalDb: new Proxy({}, { get: (_t, p) => () => dbTouched(`portalDb.${String(p)}`) }),
}))
vi.mock('@/lib/identityDb', () => ({
  identityDb: new Proxy({}, { get: (_t, p) => () => dbTouched(`identityDb.${String(p)}`) }),
}))

import { POST as submit } from './route'
import { POST as jiraStatus } from './jira-status/route'
import { POST as emailReply } from './email-reply/route'
import { resetJiraCache } from '@/lib/feedback/jira'
import { replyAddressFor } from '@/lib/feedback/replyAddress'
import {
  EMPTY_FEEDBACK_ERROR,
  FEEDBACK_UNAVAILABLE,
  LONG_FEEDBACK_ERROR,
} from '@/lib/feedback/validation'

const ANN = { email: 'ann@example.com', name: 'Ann Miller' }
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

let jira: FakeJira

function session(status: 'approved' | 'pending' | 'blocked') {
  return { user: { id: 'u1', email: ANN.email, name: ANN.name, status, roles: {} } }
}

function submitRequest(body: unknown) {
  return new Request('https://mfr.test/api/feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': CHROME_MAC,
      cookie: 'authjs.session-token=SECRET-COOKIE',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify(body),
  })
}

interface SentEmail {
  to: string
  cc?: string[]
  subject: string
  replyTo?: string
  text: string
  html: string
}
async function sent(): Promise<SentEmail[]> {
  return Promise.all(
    sendEmailMock.mock.calls.map(async ([opts]) => ({
      ...opts,
      html: await render(opts.react as ReactElement),
      text: (await render(opts.react as ReactElement, { plainText: true })).replace(/\s+/g, ' '),
    })),
  )
}

function seedIssue(over: Parameters<FakeJira['addIssue']>[0] = { key: 'KAN-123' }) {
  return jira.addIssue({
    properties: {
      'mfr-feedback': {
        memberEmail: ANN.email,
        memberName: ANN.name,
        message: 'The dock light is out.',
      },
    },
    ...over,
  })
}

function statusRequest(
  body: unknown,
  auth: string | null = `Bearer ${JIRA_ENV.JIRA_FEEDBACK_WEBHOOK_SECRET}`,
) {
  return new Request('https://mfr.test/api/feedback/jira-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  })
}

const replyTo = (key = 'KAN-123', email = ANN.email) =>
  replyAddressFor(
    { domain: JIRA_ENV.FEEDBACK_REPLY_DOMAIN, tokenSecret: JIRA_ENV.FEEDBACK_REPLY_TOKEN_SECRET },
    key,
    email,
  )

function replyRequest(sns: unknown, token = JIRA_ENV.FEEDBACK_INBOUND_WEBHOOK_SECRET) {
  return new Request(`https://mfr.test/api/feedback/email-reply?token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain; charset=UTF-8' },
    body: JSON.stringify(sns),
  })
}

function memberReply(
  opts: {
    from?: string
    to?: string
    text?: string
    headers?: Record<string, string>
    source?: string
    dmarc?: string
    dkim?: string
    messageId?: string
  } = {},
) {
  const to = opts.to ?? replyTo()
  return snsNotification(
    sesReceipt({
      mime: rawEmail({
        from: opts.from ?? `Ann Miller <${ANN.email}>`,
        to,
        text:
          opts.text ??
          'Thanks, it is still out tonight.\n\nOn Mon, Oct 12, 2026 at 9:00 AM MFR <hello@millerfamilyreunions.org> wrote:\n> Your Feedback KAN-123 is now In Progress\n',
        headers: opts.headers,
      }),
      recipients: [to],
      source: opts.source,
      dmarc: opts.dmarc,
      dkim: opts.dkim,
      messageId: opts.messageId,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const [k, v] of Object.entries(JIRA_ENV)) vi.stubEnv(k, v)
  jira = fakeJira()
  vi.stubGlobal('fetch', vi.fn(installFetch(jira)))
  resetJiraCache()
  authMock.mockResolvedValue(session('approved'))
  sendEmailMock.mockResolvedValue(true)
  membersMock.findApprovedMember.mockImplementation(async (email: string) =>
    email.toLowerCase() === ANN.email ? ANN : null,
  )
  membersMock.listSiteAdminEmails.mockResolvedValue(['owner@example.com', 'manager@example.com'])
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('CAP-048 Member Feedback · submission', () => {
  it.each([
    ['signed out', null, 401],
    ['pending', session('pending'), 403],
    ['blocked', session('blocked'), 403],
  ])(
    'CAP-048 · Only approved members see the Feedback button: a %s caller cannot submit',
    async (_s, sess, code) => {
      authMock.mockResolvedValue(sess)
      const res = await submit(submitRequest({ message: 'Hello', pagePath: '/' }))
      expect(res.status).toBe(code)
      expect(jira.createAttempts).toBe(0)
      expect(sendEmailMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['no text', '', EMPTY_FEEDBACK_ERROR],
    ['whitespace only', '   \n\t ', EMPTY_FEEDBACK_ERROR],
    ['more than 2,000 characters', 'x'.repeat(2001), LONG_FEEDBACK_ERROR],
  ])('CAP-048 · Invalid Feedback is not sent: %s', async (_c, message, error) => {
    const res = await submit(submitRequest({ message, pagePath: '/' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error })
    expect(jira.createAttempts).toBe(0)
  })

  it('CAP-048 · Valid Feedback creates one Jira issue', async () => {
    const res = await submit(
      submitRequest({ message: `  ${'y'.repeat(2000)}  `, pagePath: '/photos' }),
    )
    expect(res.status).toBe(200)
    expect(jira.createAttempts).toBe(1)
    const [issue] = [...jira.issues.values()]
    const fields = issue.createRequest!.fields as Record<string, unknown>
    expect(fields.project).toEqual({ key: 'KAN' })
    expect(fields.issuetype).toEqual({ name: 'Task' })
    expect(fields.labels).toEqual(['mfr-feedback'])
    expect(fields).not.toHaveProperty('assignee')
    expect(Object.keys(fields).sort()).toEqual([
      'description',
      'issuetype',
      'labels',
      'project',
      'summary',
    ])
  })

  it('CAP-048 · The Jira issue contains enough context to act on the Feedback', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-18T14:30:00Z'), toFake: ['Date'] })
    await submit(
      submitRequest({
        message: 'The dock light is out.\nIt has been dark since Friday.',
        pagePath: '/reservations/calendar?month=2026-10&token=abc#day-12',
      }),
    )
    vi.useRealTimers()
    const [issue] = [...jira.issues.values()]
    expect(issue.fields.summary).toBe('Feedback from Ann Miller: The dock light is out.')
    const description = JSON.stringify(issue.fields.description)
    for (const expected of [
      'The dock light is out.',
      'It has been dark since Friday.',
      'Ann Miller (ann@example.com)',
      'Page: /reservations/calendar',
      'Device: Chrome 128 on macOS (desktop)',
      'Submitted: 2026-10-18T14:30:00.000Z',
    ]) {
      expect(description).toContain(expected)
    }
    const whole = JSON.stringify(issue.createRequest)
    for (const forbidden of [
      'month=',
      'token=abc',
      'day-12',
      'SECRET-COOKIE',
      '203.0.113.9',
      'attachment',
    ]) {
      expect(whole).not.toContain(forbidden)
    }
  })

  it('CAP-048 · The site keeps no Feedback record', async () => {
    await submit(submitRequest({ message: 'Hello', pagePath: '/' }))
    expect(jira.issues.size).toBe(1)
    expect(dbTouched).not.toHaveBeenCalled()
  })

  it('CAP-048 · A successful submission confirms receipt without exposing Jira', async () => {
    const res = await submit(submitRequest({ message: 'Hello', pagePath: '/' }))
    const body = JSON.stringify(await res.json())
    expect(body).toBe('{"ok":true}')
    expect(body).not.toMatch(/KAN-|atlassian/)
  })

  it('CAP-048 · The member receives the first notification', async () => {
    await submit(submitRequest({ message: 'The dock light is out.', pagePath: '/' }))
    const member = (await sent()).find((e) => e.to === ANN.email)!
    expect(member.subject).toContain('KAN-101')
    expect(member.text).toContain('KAN-101')
    expect(member.text).toContain('The dock light is out.')
    expect(member.replyTo).toBe(replyTo('KAN-101'))
    expect(member.html).not.toMatch(/atlassian|jira/i)
  })

  it('CAP-048 · Site admins are notified of new Feedback', async () => {
    await submit(submitRequest({ message: 'The dock light is out.', pagePath: '/photos' }))
    const admin = (await sent()).find((e) => e.to !== ANN.email)!
    expect([admin.to, ...(admin.cc ?? [])]).toEqual(['owner@example.com', 'manager@example.com'])
    expect(admin.text).toContain('The dock light is out.')
    expect(admin.html).toContain('https://mfr.atlassian.net/browse/KAN-101')
    expect(admin.replyTo).toBe(ANN.email)
    // Email is the only channel: nothing else is contacted.
    const hosts = vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u)).hostname)
    expect(new Set(hosts)).toEqual(new Set(['auth.atlassian.com', 'api.atlassian.com']))
  })

  it('CAP-048 · Creating Feedback in To Do does not send a second creation notification', async () => {
    await submit(submitRequest({ message: 'Hello', pagePath: '/' }))
    const toMember = (await sent()).filter((e) => e.to === ANN.email)
    expect(toMember).toHaveLength(1)
    expect(toMember[0].subject).toBe('We received your Feedback (KAN-101)')
  })

  it('CAP-048 · Email failure does not duplicate accepted Feedback', async () => {
    sendEmailMock.mockResolvedValue(false)
    membersMock.listSiteAdminEmails.mockRejectedValue(new Error('db down'))
    const res = await submit(submitRequest({ message: 'Hello', pagePath: '/' }))
    expect(res.status).toBe(200)
    expect(jira.createAttempts).toBe(1)
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ issueKey: 'KAN-101' }),
      'feedback: could not list site admins',
    )
  })

  it("CAP-048 · Jira failure preserves the member's message", async () => {
    jira.failCreate = true
    const res = await submit(submitRequest({ message: 'Hello', pagePath: '/' }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: FEEDBACK_UNAVAILABLE })
    expect(jira.createAttempts).toBe(1)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('reports Feedback as unavailable when Jira is not configured here', async () => {
    vi.stubEnv('JIRA_FEEDBACK_CLIENT_SECRET', '')
    const res = await submit(submitRequest({ message: 'Hello', pagePath: '/' }))
    expect(res.status).toBe(503)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON', async () => {
    const res = await submit(
      new Request('https://mfr.test/api/feedback', { method: 'POST', body: 'nope' }),
    )
    expect(res.status).toBe(400)
  })
})

describe('CAP-048 Member Feedback · Jira status changes', () => {
  it.each(['To Do', 'In Progress', 'Done', 'Waiting for member'])(
    'CAP-048 · Every Jira status change notifies the member: %s',
    async (status) => {
      seedIssue({ key: 'KAN-123', fields: { status: { name: status } } as never })
      const res = await jiraStatus(
        statusRequest({ issueKey: 'KAN-123', fromStatus: 'Backlog', toStatus: status }),
      )
      expect(await res.json()).toEqual({ outcome: 'sent' })
      expect(sendEmailMock).toHaveBeenCalledTimes(1)
    },
  )

  it('CAP-048 · Every status email identifies the Feedback and its new status', async () => {
    seedIssue()
    await jiraStatus(
      statusRequest({ issueKey: 'KAN-123', fromStatus: 'To Do', toStatus: 'In Progress' }),
    )
    const [email] = await sent()
    expect(email.to).toBe(ANN.email)
    expect(email.text).toContain('KAN-123')
    expect(email.text).toContain('The dock light is out.')
    expect(email.text).toContain('is now In Progress')
    expect(email.replyTo).toBe(replyTo())
    expect(email.html).not.toMatch(/atlassian/i)
  })

  it('CAP-048 · Editing or commenting without a status change does not notify the member', async () => {
    seedIssue()
    const res = await jiraStatus(
      statusRequest({ issueKey: 'KAN-123', fromStatus: 'To Do', toStatus: 'To Do' }),
    )
    expect(await res.json()).toEqual({ outcome: 'no-status-change' })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('CAP-048 · The Done email includes the latest Jira comment', async () => {
    seedIssue({
      key: 'KAN-123',
      comments: [
        {
          id: '1',
          body: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Looking into it.' }] }],
          },
        },
        {
          id: '2',
          body: {
            type: 'doc',
            version: 1,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Replaced the bulb.' }] },
            ],
          },
        },
      ],
    })
    await jiraStatus(
      statusRequest({ issueKey: 'KAN-123', fromStatus: 'In Progress', toStatus: 'Done' }),
    )
    const [email] = await sent()
    expect(email.text).toContain('KAN-123')
    expect(email.text).toContain('The dock light is out.')
    expect(email.text).toContain('is now Done')
    expect(email.text).toContain('Resolution note: Replaced the bulb.')
    expect(email.text).not.toContain('Looking into it.')
    expect(email.replyTo).toBe(replyTo())
  })

  it('CAP-048 · A Done email does not invent a resolution note', async () => {
    seedIssue()
    await jiraStatus(
      statusRequest({ issueKey: 'KAN-123', fromStatus: 'In Progress', toStatus: 'Done' }),
    )
    const [email] = await sent()
    expect(email.text).toContain('Your Feedback KAN-123 is now Done.')
    expect(email.text).not.toContain('Resolution note')
  })

  it('CAP-048 · Re-entering any status sends a fresh update', async () => {
    seedIssue()
    await jiraStatus(
      statusRequest({ issueKey: 'KAN-123', fromStatus: 'To Do', toStatus: 'In Progress' }),
    )
    await jiraStatus(
      statusRequest({ issueKey: 'KAN-123', fromStatus: 'In Progress', toStatus: 'To Do' }),
    )
    await jiraStatus(
      statusRequest({ issueKey: 'KAN-123', fromStatus: 'To Do', toStatus: 'In Progress' }),
    )
    expect((await sent()).map((e) => e.subject)).toEqual([
      'Your Feedback KAN-123 is now In Progress',
      'Your Feedback KAN-123 is now To Do',
      'Your Feedback KAN-123 is now In Progress',
    ])
  })

  it.each([
    ['missing', null],
    ['wrong', 'Bearer not-the-secret'],
    ['not a bearer token', JIRA_ENV.JIRA_FEEDBACK_WEBHOOK_SECRET],
  ])('CAP-048 · Untrusted Jira callbacks cannot send email: %s secret', async (_c, header) => {
    seedIssue()
    const res = await jiraStatus(statusRequest({ issueKey: 'KAN-123', toStatus: 'Done' }, header))
    expect(res.status).toBe(401)
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it.each([
    ['project KAN, label mfr-feedback and the configured creator', {}, 'sent'],
    ['a different project', { fields: { project: { key: 'OPS' } } }, 'not-site-feedback'],
    ['no mfr-feedback label', { fields: { labels: ['bug'] } }, 'not-site-feedback'],
    [
      'a different creator',
      { fields: { creator: { accountId: 'someone-else' } } },
      'not-site-feedback',
    ],
    [
      'an email that is not an approved MFR member',
      { properties: { 'mfr-feedback': { memberEmail: 'stranger@example.com', message: 'hi' } } },
      'member-not-approved',
    ],
    [
      'missing member email or original message',
      { properties: { 'mfr-feedback': { memberEmail: ANN.email } } },
      'not-site-feedback',
    ],
    ['no Feedback property at all', { properties: {} }, 'not-site-feedback'],
  ])(
    'CAP-048 · Only site-created Feedback can trigger a status email: %s',
    async (_c, over, outcome) => {
      seedIssue({ key: 'KAN-123', ...(over as object) } as never)
      const res = await jiraStatus(
        statusRequest({ issueKey: 'KAN-123', fromStatus: 'To Do', toStatus: 'Done' }),
      )
      expect(await res.json()).toEqual({ outcome })
      expect(sendEmailMock).toHaveBeenCalledTimes(outcome === 'sent' ? 1 : 0)
    },
  )

  it('ignores a callback for an issue Jira does not have', async () => {
    const res = await jiraStatus(statusRequest({ issueKey: 'KAN-999', toStatus: 'Done' }))
    expect(await res.json()).toEqual({ outcome: 'not-site-feedback' })
  })

  it('rejects a malformed payload and reports Jira outages', async () => {
    expect(
      (await jiraStatus(statusRequest({ issueKey: 'not a key', toStatus: 'Done' }))).status,
    ).toBe(400)
    seedIssue()
    jira.failLookup = true
    expect(
      (await jiraStatus(statusRequest({ issueKey: 'KAN-123', toStatus: 'Done' }))).status,
    ).toBe(502)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('is not served where Feedback is not configured', async () => {
    vi.stubEnv('JIRA_FEEDBACK_WEBHOOK_SECRET', '')
    expect(
      (await jiraStatus(statusRequest({ issueKey: 'KAN-123', toStatus: 'Done' }))).status,
    ).toBe(404)
  })
})

describe('CAP-048 Member Feedback · email replies', () => {
  const commentsText = () => JSON.stringify(jira.issues.get('KAN-123')!.comments)

  it("CAP-048 · A member's email reply reaches Jira and the site admins", async () => {
    seedIssue()
    const res = await emailReply(replyRequest(memberReply()))
    expect(await res.json()).toEqual({ ok: true, outcome: 'delivered' })

    const issue = jira.issues.get('KAN-123')!
    expect(issue.comments).toHaveLength(1)
    const comment = JSON.stringify(issue.comments[0])
    expect(comment).toContain('Email reply from member Ann Miller <ann@example.com>')
    expect(comment).toContain('Thanks, it is still out tonight.')
    expect(comment).not.toContain('wrote:')
    expect(comment).not.toContain('is now In Progress')
    expect(issue.comments[0].properties).toEqual([
      { key: 'mfr-feedback-delivery', value: { deliveryId: 'ses-msg-1' } },
    ])
    expect(jira.createAttempts).toBe(0)
    expect(issue.fields.status.name).toBe('To Do')

    const [forward] = await sent()
    expect(forward.to).toBe('admins@example.org')
    expect(forward.replyTo).toBe(ANN.email)
    expect(forward.subject).toContain('KAN-123')
    expect(forward.text).toContain('Ann Miller')
    expect(forward.text).toContain('Thanks, it is still out tonight.')
    expect(forward.text).toContain('ses-msg-1')
    expect(forward.text).not.toContain('wrote:')
  })

  it('drops signatures and keeps only the new text', async () => {
    seedIssue()
    await emailReply(replyRequest(memberReply({ text: 'Fixed now, thanks!\n-- \nAnn\n555-0100' })))
    expect(commentsText()).toContain('Fixed now, thanks!')
    expect(commentsText()).not.toContain('555-0100')
  })

  it('ignores a redelivered message (same inbound delivery id)', async () => {
    seedIssue()
    await emailReply(replyRequest(memberReply()))
    const again = await emailReply(replyRequest(memberReply()))
    expect(await again.json()).toEqual({ ok: true, outcome: 'duplicate' })
    expect(jira.issues.get('KAN-123')!.comments).toHaveLength(1)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
  })

  const tampered = replyTo().replace(
    /-([0-9a-f]+)@/,
    (_m, mac: string) => `-${mac.slice(0, -1)}${mac.endsWith('0') ? '1' : '0'}@`,
  )
  const untrusted: [string, () => Promise<Response>][] = [
    [
      'an invalid inbound-provider signature',
      async () => {
        const sns = memberReply()
        return emailReply(
          replyRequest({ ...sns, Message: sns.Message.replace('ses-msg-1', 'ses-msg-2') }),
        )
      },
    ],
    [
      'a missing inbound-provider signature',
      async () => emailReply(replyRequest({ ...memberReply(), Signature: '' })),
    ],
    ['a wrong subscription token', async () => emailReply(replyRequest(memberReply(), 'guess'))],
    [
      'a stale delivery',
      async () =>
        emailReply(
          replyRequest(
            snsNotification(JSON.parse(memberReply().Message), {
              Timestamp: new Date(Date.now() - 2 * 3600_000).toISOString(),
            }),
          ),
        ),
    ],
    [
      'an untrusted signing certificate',
      async () =>
        emailReply(
          replyRequest({ ...memberReply(), SigningCertURL: 'https://evil.example.com/cert.pem' }),
        ),
    ],
    [
      'a tampered issue-specific reply address',
      async () => emailReply(replyRequest(memberReply({ to: tampered }))),
    ],
    [
      'a reply address re-pointed at another issue',
      async () =>
        emailReply(replyRequest(memberReply({ to: replyTo().replace('kan-123', 'kan-124') }))),
    ],
    [
      'a sender the inbound provider could not authenticate',
      async () => emailReply(replyRequest(memberReply({ dmarc: 'FAIL' }))),
    ],
    [
      'no DMARC policy even with a DKIM pass',
      async () => emailReply(replyRequest(memberReply({ dmarc: 'GRAY', dkim: 'PASS' }))),
    ],
    [
      'a sender email different from the original submitting member',
      async () => emailReply(replyRequest(memberReply({ from: 'bob@example.com' }))),
    ],
    [
      'a sender who is no longer an approved member',
      async () => {
        membersMock.findApprovedMember.mockResolvedValue(null)
        return emailReply(replyRequest(memberReply()))
      },
    ],
    [
      'an issue outside the configured project',
      async () => {
        jira.issues.get('KAN-123')!.fields.project = { key: 'OPS' }
        return emailReply(replyRequest(memberReply()))
      },
    ],
    [
      'an issue without the label',
      async () => {
        jira.issues.get('KAN-123')!.fields.labels = []
        return emailReply(replyRequest(memberReply()))
      },
    ],
    [
      'an issue from another creator',
      async () => {
        jira.issues.get('KAN-123')!.fields.creator = { accountId: 'devin' }
        return emailReply(replyRequest(memberReply()))
      },
    ],
    [
      'an empty reply',
      async () => emailReply(replyRequest(memberReply({ text: '\n> quoted only\n' }))),
    ],
  ]
  it.each(untrusted)(
    'CAP-048 · Untrusted email replies cannot write to Jira or email admins: %s',
    async (_c, run) => {
      seedIssue()
      const res = await run()
      expect(res.status).toBeLessThan(500)
      expect(jira.issues.get('KAN-123')!.comments).toHaveLength(0)
      expect(sendEmailMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['a bounce (empty envelope sender)', { source: '' }],
    [
      'a bounce from the mailer daemon',
      { from: 'MAILER-DAEMON@mail.example.com', source: 'MAILER-DAEMON@mail.example.com' },
    ],
    ['an automatic reply', { headers: { 'Auto-Submitted': 'auto-replied' } }],
    ['a vacation responder', { headers: { 'X-Autoreply': 'yes' } }],
    ['a bulk message', { headers: { Precedence: 'bulk' } }],
    [
      'a site-generated notification',
      { from: 'hello@millerfamilyreunions.org', source: 'hello@millerfamilyreunions.org' },
    ],
  ])('CAP-048 · Automated replies do not create email loops: %s', async (_c, opts) => {
    seedIssue()
    await emailReply(replyRequest(memberReply(opts)))
    expect(jira.issues.get('KAN-123')!.comments).toHaveLength(0)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('CAP-048 · A failed reply destination does not undo the successful destination: Jira fails', async () => {
    seedIssue()
    jira.failComment = true
    const res = await emailReply(replyRequest(memberReply()))
    expect(res.status).toBe(200)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'ses-msg-1', destination: 'jira' }),
      expect.any(String),
    )
    expect(jira.createAttempts).toBe(0)
  })

  it('CAP-048 · A failed reply destination does not undo the successful destination: forwarding fails', async () => {
    seedIssue()
    sendEmailMock.mockResolvedValue(false)
    await emailReply(replyRequest(memberReply()))
    expect(jira.issues.get('KAN-123')!.comments).toHaveLength(1)
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'ses-msg-1', destination: 'admin-mailbox' }),
      expect.any(String),
    )
    expect(jira.createAttempts).toBe(0)
  })

  it('lets SNS retry when Jira cannot be reached before anything was delivered', async () => {
    seedIssue()
    jira.failLookup = true
    const res = await emailReply(replyRequest(memberReply()))
    expect(res.status).toBe(503)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('confirms the SNS subscription only for a signed request', async () => {
    const { signSns } = await import('@/tests/feedback/fakes')
    const confirmation = signSns({
      Type: 'SubscriptionConfirmation',
      MessageId: 'm',
      TopicArn: 'arn:aws:sns:us-east-1:123:t',
      Message: 'confirm',
      Timestamp: new Date().toISOString(),
      Token: 'tok',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok',
    })
    expect((await emailReply(replyRequest(confirmation))).status).toBe(200)
    expect(
      vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('ConfirmSubscription')),
    ).toBe(true)

    vi.mocked(fetch).mockClear()
    const forged = { ...confirmation, SubscribeURL: 'https://evil.example.com/' }
    expect((await emailReply(replyRequest(forged))).status).toBe(401)
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('evil'))).toBe(false)
  })

  it('rejects malformed confirmations and tolerates non-JSON or unknown messages', async () => {
    const { signSns } = await import('@/tests/feedback/fakes')
    const confirm = (SubscribeURL?: string) =>
      signSns({
        Type: 'SubscriptionConfirmation',
        MessageId: 'm',
        TopicArn: 'arn:aws:sns:us-east-1:123:t',
        Message: 'confirm',
        Timestamp: new Date().toISOString(),
        Token: 'tok',
        ...(SubscribeURL ? { SubscribeURL } : {}),
      })
    expect((await emailReply(replyRequest(confirm()))).status).toBe(400)
    expect((await emailReply(replyRequest(confirm('https://evil.example.com/')))).status).toBe(400)
    const notJson = signSns({
      Type: 'Notification',
      MessageId: 'n',
      TopicArn: 't',
      Message: 'not json',
      Timestamp: new Date().toISOString(),
    })
    expect(await (await emailReply(replyRequest(notJson))).json()).toEqual({
      ok: true,
      outcome: 'ignored',
    })
    const other = signSns({
      Type: 'UnsubscribeConfirmation',
      MessageId: 'u',
      TopicArn: 't',
      Message: 'bye',
      Timestamp: new Date().toISOString(),
      Token: 't',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/',
    })
    expect((await emailReply(replyRequest(other))).status).toBe(200)
    const raw = new Request(
      `https://mfr.test/api/feedback/email-reply?token=${JIRA_ENV.FEEDBACK_INBOUND_WEBHOOK_SECRET}`,
      { method: 'POST', body: '{not json' },
    )
    expect((await emailReply(raw)).status).toBe(400)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('is not served where replies are not configured, and rejects junk', async () => {
    expect((await emailReply(replyRequest('not sns'))).status).toBe(400)
    vi.stubEnv('FEEDBACK_REPLY_DOMAIN', '')
    expect((await emailReply(replyRequest(memberReply()))).status).toBe(404)
  })
})
