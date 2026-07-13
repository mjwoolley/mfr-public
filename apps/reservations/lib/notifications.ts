import { createElement } from 'react'
import { and, eq, or } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/auth/identityDb'
import { sendEmail, appUrl } from '@/lib/email'
import { logger } from '@/lib/logger'
import { ReservationConfirmation } from '@/emails/ReservationConfirmation'
import { ReservationUpdated } from '@/emails/ReservationUpdated'
import { ReservationCancelled } from '@/emails/ReservationCancelled'

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
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000)
}

// One identity-DB round-trip fetches the owner AND every approved
// reservations admin; the owner is deduped out of the CC list.
async function getReservationRecipients(ownerUserId: string) {
  const rows = await identityDb
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isReservationsAdmin: users.isReservationsAdmin,
      status: users.status,
    })
    .from(users)
    .where(
      or(eq(users.id, ownerUserId), and(eq(users.isReservationsAdmin, true), eq(users.status, 'approved')))
    )
  const owner = rows.find((r) => r.id === ownerUserId) ?? null
  const admins = rows.filter((r) => r.isReservationsAdmin && r.status === 'approved' && r.id !== ownerUserId)
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
      logger.warn({ reservationId: input.reservationId, ownerUserId: input.ownerUserId }, 'reservation email skipped: owner not found in identity db')
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
    logger.error({ err, reservationId: input.reservationId }, 'failed to send reservation-created email')
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
      logger.warn({ reservationId: input.reservationId, ownerUserId: input.ownerUserId }, 'reservation email skipped: owner not found in identity db')
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
    logger.error({ err, reservationId: input.reservationId }, 'failed to send reservation-updated email')
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
      logger.warn({ reservationId: input.reservationId, ownerUserId: input.ownerUserId }, 'reservation email skipped: owner not found in identity db')
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
    logger.error({ err, reservationId: input.reservationId }, 'failed to send reservation-cancelled email')
  }
}
