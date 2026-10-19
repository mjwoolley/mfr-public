// Transactional email via Amazon SES with the portal-wide non-prod safety
// net: real recipients only when EMAIL_ENABLED=true (production only);
// everywhere else mail redirects to EMAIL_OVERRIDE_TO or is dropped. Mirrors
// the accounting app's lib/email.ts. Failures are logged, never thrown;
// the result says whether SES accepted the message.

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { render } from '@react-email/render'
import { logger } from '@/lib/reservations/logger'
import { siteOrigin } from '@/lib/siteUrl'

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
  // The merged app serves reservations under /reservations on the shared
  // origin, so APP_BASE_URL is the bare origin (e.g. https://millerfamily…org)
  // and the section prefix is appended here — one APP_BASE_URL feeds both the
  // reservations and accounting email helpers. Stays idempotent if the env
  // value already carries the /reservations segment. Plain string join, not
  // `new URL(path, base)` — that constructor treats a leading-slash path as
  // absolute and would drop the /reservations segment.
  const origin = siteOrigin()
  const base = origin.endsWith('/reservations') ? origin : `${origin}/reservations`
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Fold a real recipient into a plus sub-address of the override inbox, so each
 * redirected message keeps the original address visible and arrives as a
 * distinct "user" while still landing in one inbox. The full original address
 * is encoded with the conventional `local+other=domain@inbox` form:
 *   plusAddress('mwoolley2@gmail.com', 'dbrown@gmail.com')
 *     => 'mwoolley2+dbrown=gmail.com@gmail.com'
 * Assumes the inbox provider supports '+' sub-addressing (Gmail does). Falls
 * back to the bare inbox if either address is malformed. Mirrors the accounting
 * app's helper of the same name.
 */
export function plusAddress(inbox: string, original: string): string {
  const at = inbox.lastIndexOf('@')
  if (at === -1) return inbox
  const baseLocal = inbox.slice(0, at).split('+')[0]
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
  cc?: string[]
  subject: string
  react: React.ReactElement
  replyTo?: string
}): Promise<boolean> {
  const routing = resolveRecipient(opts.to)
  if (!routing.deliver) {
    logger.warn({ to: opts.to }, `email skipped — ${routing.reason}`)
    return false
  }

  // cc recipients are real admins, so they get the same treatment as `to`:
  // passed through in prod, redirected to the override inbox otherwise.
  const override = process.env.EMAIL_OVERRIDE_TO
  const cc =
    process.env.EMAIL_ENABLED === 'true'
      ? opts.cc
      : override
        ? (opts.cc ?? []).map((addr) => plusAddress(override, addr))
        : undefined

  const subject = routing.redirectedFrom
    ? `[dev→${routing.redirectedFrom}] ${opts.subject}`
    : opts.subject

  try {
    const html = await render(opts.react)
    await getClient().send(
      new SendEmailCommand({
        FromEmailAddress: process.env.EMAIL_FROM ?? 'hello@millerfamilyreunions.org',
        Destination: {
          ToAddresses: [routing.to],
          CcAddresses: cc && cc.length > 0 ? cc : undefined,
        },
        ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: { Html: { Data: html } },
          },
        },
      }),
    )
    return true
  } catch (error) {
    logger.error({ error, to: routing.to, subject }, 'failed to send email')
    return false
  }
}
