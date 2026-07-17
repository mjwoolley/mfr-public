// The booking-rules engine: a pure function over plain data, so the exact
// same logic runs client-side (live feedback in the booking dialog) and
// server-side (the POST/PATCH routes). The DB's exclusion constraint is the
// final overlap authority for races — see lib/db/isOverlapError.ts.
//
// All dates are ISO YYYY-MM-DD strings, compared with plain `<`/`>` — safe
// because the format sorts lexicographically. Ranges are half-open
// [startDate, endDate): the end date is checkout day, not a booked night.

import { nightsBetween, rangesOverlap, calendarYearOf } from './dateHelpers'

export interface ExistingReservation {
  id: string
  userId: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'cancelled'
}

export interface BlockedDateRange {
  startDate: string
  endDate: string
}

export interface BookingRules {
  bookingHorizonDate: string
  maxConsecutiveNights: number
  maxNightsPerUserPerYear: number
}

export interface ValidateReservationInput {
  userId: string
  startDate: string
  endDate: string
  excludeReservationId?: string
  existingReservations: ExistingReservation[]
  blockedDates: BlockedDateRange[]
  bookingRules: BookingRules
  /** Whether the acting user may administer reservations (bypasses PAST_DATE). */
  isAdmin: boolean
  /** Today as YYYY-MM-DD (see todayISO in dateHelpers); used by the past-date rule. */
  today: string
}

export type ValidationCode =
  | 'INVALID_RANGE'
  | 'PAST_DATE'
  | 'HORIZON'
  | 'MAX_CONSECUTIVE'
  | 'YEARLY_CAP'
  | 'OVERLAP_BOOKED'
  | 'OVERLAP_BLOCKED'

export type ValidationResult =
  { valid: true } | { valid: false; code: ValidationCode; reason: string }

export function validateReservation(input: ValidateReservationInput): ValidationResult {
  const {
    userId,
    startDate,
    endDate,
    excludeReservationId,
    existingReservations,
    blockedDates,
    bookingRules,
    isAdmin,
    today,
  } = input

  if (endDate <= startDate) {
    return {
      valid: false,
      code: 'INVALID_RANGE',
      reason: 'The end date must be after the start date.',
    }
  }

  // A brand-new reservation (no excludeReservationId) by a non-admin can't be
  // entirely in the past: because endDate is the exclusive checkout day,
  // endDate <= today means every booked night falls before today. Admins may
  // still backfill past stays, and EDITS are exempt so a member can extend the
  // end date of a stay that began before today.
  if (excludeReservationId === undefined && !isAdmin && endDate <= today) {
    return {
      valid: false,
      code: 'PAST_DATE',
      reason: "New reservations can't be entirely in the past.",
    }
  }

  if (startDate > bookingRules.bookingHorizonDate) {
    return {
      valid: false,
      code: 'HORIZON',
      reason: `Reservations cannot start after ${bookingRules.bookingHorizonDate}. That date range isn't open yet.`,
    }
  }

  const nights = nightsBetween(startDate, endDate)
  if (nights > bookingRules.maxConsecutiveNights) {
    return {
      valid: false,
      code: 'MAX_CONSECUTIVE',
      reason: `Reservations cannot exceed ${bookingRules.maxConsecutiveNights} consecutive nights.`,
    }
  }

  // Checks run cheapest-first: range/horizon/length above, then the yearly
  // cap, then overlaps. `excludeReservationId` drops the reservation being
  // edited from every check so an edit doesn't collide with itself. A stay's
  // nights all count toward the calendar year it STARTS in.
  const year = calendarYearOf(startDate)
  const otherConfirmed = existingReservations.filter(
    (r) => r.status === 'confirmed' && r.id !== excludeReservationId,
  )

  const existingNightsThisYear = otherConfirmed
    .filter((r) => r.userId === userId && calendarYearOf(r.startDate) === year)
    .reduce((sum, r) => sum + nightsBetween(r.startDate, r.endDate), 0)

  if (existingNightsThisYear + nights > bookingRules.maxNightsPerUserPerYear) {
    return {
      valid: false,
      code: 'YEARLY_CAP',
      reason: `This would exceed your ${bookingRules.maxNightsPerUserPerYear}-night limit for ${year}.`,
    }
  }

  const overlapsBooked = otherConfirmed.some((r) =>
    rangesOverlap(startDate, endDate, r.startDate, r.endDate),
  )
  if (overlapsBooked) {
    return {
      valid: false,
      code: 'OVERLAP_BOOKED',
      reason: 'Those dates overlap an existing reservation.',
    }
  }

  const overlapsBlocked = blockedDates.some((b) =>
    rangesOverlap(startDate, endDate, b.startDate, b.endDate),
  )
  if (overlapsBlocked) {
    return {
      valid: false,
      code: 'OVERLAP_BLOCKED',
      reason: 'Those dates are blocked and unavailable.',
    }
  }

  return { valid: true }
}
