'use client'

import { useMemo, useState } from 'react'
import { ModalDialog } from '@mfr/ui'
import { validateReservation, type ExistingReservation } from '@/lib/rules/validateReservation'
import { nightsBetween } from '@/lib/rules/dateHelpers'
import { useReservationMutations } from './useReservationMutations'
import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

interface BookingPanelProps {
  userId: string
  /** When set, the dialog edits this reservation instead of creating one. */
  editReservationId?: string
  initialStart: string
  initialEnd: string
  reservations: ReservationRow[]
  blockedDates: BlockedDateRow[]
  bookingRules: BookingRulesRow
  onClose: () => void
  onSubmitted: () => void
}

/**
 * The New reservation / Edit reservation dialog: editable check-in and
 * check-out dates (per the design, dates only — no name/guests/notes),
 * live-validated against the rules engine, submitted to the reservations
 * API which re-validates server-side.
 */
export function BookingPanel({
  userId,
  editReservationId,
  initialStart,
  initialEnd,
  reservations,
  blockedDates,
  bookingRules,
  onClose,
  onSubmitted,
}: BookingPanelProps) {
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { createReservation, updateReservation } = useReservationMutations()

  const isEdit = Boolean(editReservationId)

  const validation = useMemo(() => {
    const existing: ExistingReservation[] = reservations.map((r) => ({
      id: r.id,
      userId: r.userId,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
    }))
    return validateReservation({
      userId,
      startDate,
      endDate,
      excludeReservationId: editReservationId,
      existingReservations: existing,
      blockedDates: blockedDates.map((b) => ({ startDate: b.startDate, endDate: b.endDate })),
      bookingRules: {
        bookingHorizonDate: bookingRules.bookingHorizonDate,
        maxConsecutiveNights: bookingRules.maxConsecutiveNights,
        maxNightsPerUserPerYear: bookingRules.maxNightsPerUserPerYear,
      },
    })
  }, [userId, startDate, endDate, editReservationId, reservations, blockedDates, bookingRules])

  const nights = endDate > startDate ? nightsBetween(startDate, endDate) : 0

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    const result = isEdit
      ? await updateReservation(editReservationId!, startDate, endDate)
      : await createReservation(startDate, endDate)
    setSubmitting(false)
    if (!result.ok) {
      setSubmitError(result.error ?? 'Something went wrong.')
      return
    }
    onSubmitted()
  }

  return (
    <ModalDialog title={isEdit ? 'Edit reservation' : 'New reservation'} onClose={onClose}>
      <div className="flex gap-3">
        <div className="field flex-1">
          <label htmlFor="booking-check-in">Check-in</label>
          <input
            id="booking-check-in"
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="field flex-1">
          <label htmlFor="booking-check-out">Check-out</label>
          <input
            id="booking-check-out"
            className="input"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      {nights > 0 && validation.valid && (
        <div className="text-sm font-semibold" style={{ color: 'var(--color-accent-2-700)' }}>
          {nights} night{nights === 1 ? '' : 's'} at the cabin
        </div>
      )}
      {!validation.valid && (
        <div className="text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
          {validation.reason}
        </div>
      )}
      {submitError && (
        <div className="text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
          {submitError}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!validation.valid || submitting}
        >
          {submitting
            ? isEdit
              ? 'Saving…'
              : 'Booking…'
            : isEdit
              ? 'Save changes'
              : 'Confirm reservation'}
        </button>
      </div>
    </ModalDialog>
  )
}
