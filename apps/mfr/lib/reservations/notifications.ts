// Builds and sends the three reservation notification emails (created /
// updated / cancelled): resolves the owner + reservations-admin CC list
// across the portal and identity DBs, renders the react-email template, and
// hands off to lib/email.ts (which enforces the non-prod redirect).

import { createElement } from 'react'
import { and, eq, inArray, or } from 'drizzle-orm'
import {
  users,
  createReservationsAdminIdsReaderFromEnv,
  type ReservationsAdminIdsReader,
} from '@mfr/auth'
import { identityDb } from '@/lib/reservations/auth/identityDb'
import { sendEmail, appUrl } from '@/lib/reservations/email'
import { logger } from '@/lib/reservations/logger'
import { ReservationConfirmation } from '@/emails/reservations/ReservationConfirmation'
import { ReservationUpdated } from '@/emails/reservations/ReservationUpdated'
import { ReservationCancelled } from '@/emails/reservations/ReservationCancelled'

type Recipient = { id: string; email: string; name: string | null }

function displayName(recipient: Recipient) {
  return recipient.name ?? recipient.email.split('@')[0]
}

// Dates arrive as YYYY-MM-DD strings (date-mode columns); parse at local
// midnight so the formatted day never shifts across timezones.
function formatShort(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatLong(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function nightsBetween(startDate: string, endDate: string) {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  )
}

// "Who is a reservations admin" now lives in the portal DB (site owner or
// site manager), not the identity `users` table — so first resolve the admin
// ids from the portal, then one identity-DB round-trip fetches the owner AND
// those admins (for email/name), keeping only approved ones. The owner is
// deduped out of the CC list.
// Built lazily on first use so importing this module doesn't require
// PORTAL_DATABASE_URL at load time (unit tests that mock it never hit this).
let _reservationsAdminIds: ReservationsAdminIdsReader | undefined
function reservationsAdminIds(): Promise<string[]> {
  _reservationsAdminIds ??= createReservationsAdminIdsReaderFromEnv()
  return _reservationsAdminIds()
}

async function getReservationRecipients(ownerUserId: string) {
  const adminIds = await reservationsAdminIds()
  const rows = await identityDb
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
    })
    .from(users)
    .where(
      adminIds.length
        ? or(
            eq(users.id, ownerUserId),
            and(inArray(users.id, adminIds), eq(users.status, 'approved')),
          )
        : eq(users.id, ownerUserId),
    )
  const adminIdSet = new Set(adminIds)
  const owner = rows.find((r) => r.id === ownerUserId) ?? null
  const admins = rows.filter(
    (r) => adminIdSet.has(r.id) && r.status === 'approved' && r.id !== ownerUserId,
  )
  return { owner, admins }
}

// The actor is always the owner or a reservations admin (loadOwnedReservation
// enforces this), so they're in the recipients query result. Missing actor →
// undefined, and the email simply omits the changed/cancelled-by line.
function findActor(actorUserId: string, owner: Recipient, admins: Recipient[]) {
  if (actorUserId === owner.id) return null
  return admins.find((a) => a.id === actorUserId)
}

export async function sendReservationCreatedEmail(input: {
  reservationId: string
  ownerUserId: string
  startDate: string
  endDate: string
}): Promise<void> {
  try {
    const { owner, admins } = await getReservationRecipients(input.ownerUserId)
    if (!owner) {
      logger.warn(
        { reservationId: input.reservationId, ownerUserId: input.ownerUserId },
        'reservation email skipped: owner not found in identity db',
      )
      return
    }
    await sendEmail({
      to: owner.email,
      cc: admins.map((a) => a.email),
      subject: `Reservation confirmed: ${formatShort(input.startDate)} – ${formatShort(input.endDate)}`,
      react: createElement(ReservationConfirmation, {
        ownerName: displayName(owner),
        startDate: formatLong(input.startDate),
        endDate: formatLong(input.endDate),
        nights: nightsBetween(input.startDate, input.endDate),
        calendarUrl: appUrl('/'),
      }),
    })
  } catch (err) {
    logger.error(
      { err, reservationId: input.reservationId },
      'failed to send reservation-created email',
    )
  }
}

export async function sendReservationUpdatedEmail(input: {
  reservationId: string
  ownerUserId: string
  actorUserId: string
  startDate: string
  endDate: string
  previousStartDate: string
  previousEndDate: string
}): Promise<void> {
  try {
    const { owner, admins } = await getReservationRecipients(input.ownerUserId)
    if (!owner) {
      logger.warn(
        { reservationId: input.reservationId, ownerUserId: input.ownerUserId },
        'reservation email skipped: owner not found in identity db',
      )
      return
    }
    const actor = findActor(input.actorUserId, owner, admins)
    await sendEmail({
      to: owner.email,
      cc: admins.map((a) => a.email),
      subject: `Reservation updated: now ${formatShort(input.startDate)} – ${formatShort(input.endDate)}`,
      replyTo: actor?.email,
      react: createElement(ReservationUpdated, {
        ownerName: displayName(owner),
        previousStartDate: formatLong(input.previousStartDate),
        previousEndDate: formatLong(input.previousEndDate),
        startDate: formatLong(input.startDate),
        endDate: formatLong(input.endDate),
        nights: nightsBetween(input.startDate, input.endDate),
        changedByName: actor ? displayName(actor) : undefined,
        calendarUrl: appUrl('/'),
      }),
    })
  } catch (err) {
    logger.error(
      { err, reservationId: input.reservationId },
      'failed to send reservation-updated email',
    )
  }
}

export async function sendReservationCancelledEmail(input: {
  reservationId: string
  ownerUserId: string
  actorUserId: string
  startDate: string
  endDate: string
}): Promise<void> {
  try {
    const { owner, admins } = await getReservationRecipients(input.ownerUserId)
    if (!owner) {
      logger.warn(
        { reservationId: input.reservationId, ownerUserId: input.ownerUserId },
        'reservation email skipped: owner not found in identity db',
      )
      return
    }
    const actor = findActor(input.actorUserId, owner, admins)
    await sendEmail({
      to: owner.email,
      cc: admins.map((a) => a.email),
      subject: `Reservation cancelled: ${formatShort(input.startDate)} – ${formatShort(input.endDate)}`,
      replyTo: actor?.email,
      react: createElement(ReservationCancelled, {
        ownerName: displayName(owner),
        startDate: formatLong(input.startDate),
        endDate: formatLong(input.endDate),
        cancelledByName: actor ? displayName(actor) : undefined,
        calendarUrl: appUrl('/'),
      }),
    })
  } catch (err) {
    logger.error(
      { err, reservationId: input.reservationId },
      'failed to send reservation-cancelled email',
    )
  }
}
