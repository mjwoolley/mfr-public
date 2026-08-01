// What happens the first time someone signs in with Google.
//
// Two outcomes, decided by whether their login email matches a Shareholder:
//
//   match    -> link the Shareholder, approve them, and let them straight in.
//               The email is proof enough: an admin put that address on the
//               shareholder record.
//   no match -> leave them `pending` and page the admins, since nothing here
//               can tell whether they're family. The notification carries a
//               direct link to User Management so approving is one click from
//               the phone it arrives on.
//
// Every step is best-effort: this runs inside the Auth.js `createUser` event,
// and a failure here must never turn someone's first sign-in into an error
// page. The worst case is the pre-existing behaviour — a pending user and a
// silent admin.

import { createElement } from 'react'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { db } from '@/lib/db/client'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { shareholder, portalUserRoles, activityLog } from '@/lib/db/schema'
import { sendEmail } from '@/lib/reservations/email'
import { siteUrl } from '@/lib/siteUrl'
import { logger } from '@/lib/reservations/logger'
import { NewSignupNotification } from '@/emails/portal/NewSignupNotification'

/**
 * SMS gateway that also gets the alert, so a signup reaches a phone rather than
 * waiting in an inbox. Overridable without a deploy; set it empty to turn the
 * text off.
 */
export const SIGNUP_ALERT_SMS_DEFAULT = '4848867359@vtext.net'

function signupAlertSmsTo(): string | null {
  const raw = process.env.SIGNUP_ALERT_SMS_TO ?? SIGNUP_ALERT_SMS_DEFAULT
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Emails of everyone who should hear about a new signup: any approved user
 * holding a portal role. Only site owners can actually approve, but managers
 * are told too so nobody is waiting on one person.
 */
export async function listAdminEmails(): Promise<string[]> {
  const roleRows = await portalDb
    .select({ id: portalUserRoles.identityUserId })
    .from(portalUserRoles)
    .where(
      sql`${portalUserRoles.isSiteOwner} OR ${portalUserRoles.isSiteManager} OR ${portalUserRoles.isAccountingManager}`,
    )
  const ids = roleRows.map((r) => r.id)
  if (ids.length === 0) return []

  const rows = await identityDb
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, 'approved')))
  return rows.map((r) => r.email)
}

/** Finds a Shareholder whose email is the one this person signs in with. */
async function findShareholderByEmail(email: string) {
  return db.query.shareholder.findFirst({ where: eq(shareholder.email, email.toLowerCase()) })
}

async function notifyAdmins(input: { id: string; email: string; name?: string | null }) {
  const adminEmails = await listAdminEmails()
  const sms = signupAlertSmsTo()
  const recipients = [...adminEmails, ...(sms ? [sms] : [])]
  if (recipients.length === 0) {
    logger.warn({ userId: input.id }, 'new signup: no admin recipients to notify')
    return
  }

  const signupName = input.name?.trim() || input.email
  const [to, ...cc] = recipients
  await sendEmail({
    to,
    cc,
    // Short subject on purpose — one recipient is an SMS gateway.
    subject: `New signup: ${signupName}`,
    react: createElement(NewSignupNotification, {
      signupName,
      signupEmail: input.email,
      adminUrl: siteUrl('/admin/users'),
    }),
  })
}

/**
 * The `onUserCreated` body. Returns what it did, so callers (and tests) can
 * assert on the decision rather than on side effects alone.
 */
export async function handleNewSignup(input: {
  id: string
  email: string
  name?: string | null
}): Promise<'auto-approved' | 'pending-admins-notified' | 'failed'> {
  try {
    const match = await findShareholderByEmail(input.email)

    if (!match) {
      await notifyAdmins(input)
      return 'pending-admins-notified'
    }

    // Link first: if the shareholder is somehow already claimed by another
    // login, the unique index on userId rejects this and we must NOT approve
    // on the strength of a link that didn't happen.
    if (match.userId !== input.id) {
      await db.update(shareholder).set({ userId: input.id }).where(eq(shareholder.id, match.id))
    }

    await identityDb.update(users).set({ status: 'approved' }).where(eq(users.id, input.id))
    await db.insert(activityLog).values({
      eventType: 'user_auto_approved',
      actorUserId: input.id,
      metadata: { shareholderId: match.id, matchedOn: 'email' },
    })
    return 'auto-approved'
  } catch (err) {
    // Swallow: a broken notification or a lost link race must not break the
    // sign-in. They stay pending, which is exactly where they'd have been
    // before any of this existed.
    logger.error({ err, userId: input.id }, 'new-signup handling failed')
    return 'failed'
  }
}
