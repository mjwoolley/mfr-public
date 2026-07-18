// Transactional email via Amazon SES with a hard non-prod safety net: real
// recipients are only reachable when EMAIL_ENABLED=true (production only);
// everywhere else mail is redirected to EMAIL_OVERRIDE_TO or dropped. Send
// failures are logged, never thrown — email must not break a ledger action.

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { render } from '@react-email/render'

let client: SESv2Client | null = null

function getClient() {
  if (!client) {
    client = new SESv2Client({
      region: process.env.SES_REGION ?? 'us-east-1',
      // Vercel reserves the AWS_* env names for its own runtime, so the
      // credentials use SES_-prefixed names and are passed explicitly.
      credentials: process.env.SES_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.SES_ACCESS_KEY_ID,
            secretAccessKey: process.env.SES_SECRET_ACCESS_KEY ?? '',
          }
        : undefined,
    })
  }
  return client
}

export function appUrl(path: string) {
  // The merged app serves accounting under /accounting on the shared origin,
  // so APP_BASE_URL is the bare origin (e.g. https://millerfamily…org) and the
  // section prefix is appended here — one APP_BASE_URL feeds both the accounting
  // and reservations email helpers. Stays idempotent if the env value already
  // carries the /accounting segment. Plain string join, not `new URL(path,
  // base)` — that constructor treats a leading-slash path as absolute and would
  // drop the /accounting segment.
  const origin = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const base = origin.endsWith('/accounting') ? origin : `${origin}/accounting`
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Fold a real recipient into a plus sub-address of the override inbox, so each
 * redirected message keeps the original address visible and arrives as a
 * distinct "user" while still landing in one inbox. The full original address
 * is encoded with the conventional `local+other=domain@inbox` form:
 *   plusAddress("mwoolley2@gmail.com", "dbrown@gmail.com")
 *     => "mwoolley2+dbrown=gmail.com@gmail.com"
 * Assumes the inbox provider supports "+" sub-addressing (Gmail does). Falls
 * back to the bare inbox if either address is malformed.
 */
export function plusAddress(inbox: string, original: string): string {
  const at = inbox.lastIndexOf('@')
  if (at === -1) return inbox
  const baseLocal = inbox.slice(0, at).split('+')[0] // drop any existing +tag
  const domain = inbox.slice(at + 1)
  const tag = original
    .trim()
    .toLowerCase()
    .replace(/@/g, '=')
    .replace(/[^a-z0-9._=-]/g, '-')
  return tag ? `${baseLocal}+${tag}@${domain}` : inbox
}

/**
 * Decide who actually receives a message. Real recipients are only ever used
 * when sending is explicitly enabled — production is the only environment that
 * sets EMAIL_ENABLED=true. Anywhere else (local dev against copied-down prod
 * data), mail is redirected to a plus sub-address of EMAIL_OVERRIDE_TO, or
 * dropped if that is unset, so a real family member can never be emailed from
 * a non-prod environment.
 */
export function resolveRecipient(
  to: string,
): { deliver: true; to: string; redirectedFrom?: string } | { deliver: false; reason: string } {
  if (process.env.EMAIL_ENABLED === 'true') {
    return { deliver: true, to }
  }
  const override = process.env.EMAIL_OVERRIDE_TO
  if (override) {
    return { deliver: true, to: plusAddress(override, to), redirectedFrom: to }
  }
  return {
    deliver: false,
    reason: `email disabled (no EMAIL_ENABLED, no EMAIL_OVERRIDE_TO); would have sent to ${to}`,
  }
}

export async function sendEmail(opts: {
  to: string
  subject: string
  react: React.ReactElement
  replyTo?: string
}) {
  const routing = resolveRecipient(opts.to)
  if (!routing.deliver) {
    console.warn(`[email] skipped — ${routing.reason}`)
    return
  }
  const subject = routing.redirectedFrom
    ? `[dev→${routing.redirectedFrom}] ${opts.subject}`
    : opts.subject

  try {
    const html = await render(opts.react)
    await getClient().send(
      new SendEmailCommand({
        FromEmailAddress: process.env.EMAIL_FROM ?? 'accounting@millerfamilyreunions.org',
        Destination: { ToAddresses: [routing.to] },
        ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: { Html: { Data: html } },
          },
        },
      }),
    )
  } catch (error) {
    console.error('Failed to send email:', error)
  }
}
