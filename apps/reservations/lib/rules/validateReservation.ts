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
}

export type ValidationCode =
  | 'INVALID_RANGE'
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
  } = input

  if (endDate <= startDate) {
    return {
      valid: false,
      code: 'INVALID_RANGE',
      reason: 'The end date must be after the start date.',
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
