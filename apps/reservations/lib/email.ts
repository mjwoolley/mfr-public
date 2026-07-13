import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { render } from '@react-email/render'
import { logger } from '@/lib/logger'

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
  try {
    const html = await render(opts.react)
    await getClient().send(
      new SendEmailCommand({
        FromEmailAddress: process.env.EMAIL_FROM ?? 'reservations@millerfamilyreunions.org',
        Destination: {
          ToAddresses: [opts.to],
          CcAddresses: opts.cc && opts.cc.length > 0 ? opts.cc : undefined,
        },
        ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: opts.subject },
            Body: { Html: { Data: html } },
          },
        },
      })
    )
  } catch (error) {
    logger.error({ error, to: opts.to, subject: opts.subject }, 'failed to send email')
  }
}
