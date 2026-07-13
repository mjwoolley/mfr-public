import { Resend } from 'resend'
import { logger } from '@/lib/logger'

let client: Resend | null = null

function getClient() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

export function appUrl(path: string) {
  // Plain string join, not `new URL(path, base)` — that constructor treats a
  // leading-slash path as absolute and silently drops the /reservations path
  // segment in APP_BASE_URL (same rationale as the accounting app's helper).
  const base = (process.env.APP_BASE_URL || 'http://localhost:3000/reservations').replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export async function sendEmail(opts: {
  to: string
  cc?: string[]
  subject: string
  react: React.ReactElement
  replyTo?: string
}) {
  const resend = getClient()
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
    to: opts.to,
    cc: opts.cc && opts.cc.length > 0 ? opts.cc : undefined,
    subject: opts.subject,
    react: opts.react,
    replyTo: opts.replyTo,
  })
  if (error) {
    logger.error({ error, to: opts.to, subject: opts.subject }, 'failed to send email')
  }
}
