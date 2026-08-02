'use client'

import { useMemo, useState } from 'react'
import { ModalDialog } from '@mfr/ui'
import {
  validateReservation,
  type ExistingReservation,
} from '@/lib/reservations/rules/validateReservation'
import { addDays, nightsBetween, todayISO } from '@/lib/reservations/rules/dateHelpers'
import { useReservationMutations } from './useReservationMutations'
import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

interface BookingPanelProps {
  userId: string
  /** Whether the acting user may administer reservations (bypasses the past-date rule). */
  isAdmin: boolean
  /** When set, the dialog edits this reservation instead of creating one. */
  editReservationId?: string
  /**
   * Admin-only: when provided on a CREATE dialog, the admin picks which member
   * the reservation is for from this list, and its id is validated + submitted
   * as the reservation owner. Omitted on the member-facing dialog, where the
   * reservation is always for `userId` (the signed-in member).
   */
  members?: { id: string; name: string | null }[]
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
  isAdmin,
  editReservationId,
  members,
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

  // Admin "book for a member" mode: pick the owner from `members`. The chosen
  // id drives validation (their yearly cap) and is submitted as the owner.
  const showMemberPicker = Boolean(members) && !isEdit
  const [selectedUserId, setSelectedUserId] = useState('')
  const memberMissing = showMemberPicker && !selectedUserId
  const ownerUserId = showMemberPicker ? selectedUserId : userId

  const validation = useMemo(() => {
    const existing: ExistingReservation[] = reservations.map((r) => ({
      id: r.id,
      userId: r.userId,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
    }))
    return validateReservation({
      userId: ownerUserId,
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
      isAdmin,
      today: todayISO(),
    })
  }, [
    ownerUserId,
    isAdmin,
    startDate,
    endDate,
    editReservationId,
    reservations,
    blockedDates,
    bookingRules,
  ])

  const nights = endDate > startDate ? nightsBetween(startDate, endDate) : 0

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    const result = isEdit
      ? await updateReservation(editReservationId!, startDate, endDate)
      : await createReservation(startDate, endDate, showMemberPicker ? selectedUserId : undefined)
    setSubmitting(false)
    if (!result.ok) {
      setSubmitError(result.error ?? 'Something went wrong.')
      return
    }
    onSubmitted()
  }

  return (
    <ModalDialog title={isEdit ? 'Edit reservation' : 'New reservation'} onClose={onClose}>
      {showMemberPicker && (
        <div className="field mb-3">
          <label htmlFor="booking-member">Member</label>
          <select
            id="booking-member"
            className="input"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Select a member…</option>
            {members!.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? 'Unnamed member'}
              </option>
            ))}
          </select>
        </div>
      )}
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
          {/* The check-out day is the exclusive end of the half-open stay, so
              it maps straight to endDate. Checkout must be after check-in. */}
          <label htmlFor="booking-check-out">Check-out</label>
          <input
            id="booking-check-out"
            className="input"
            type="date"
            min={addDays(startDate, 1)}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      {memberMissing && (
        <div className="text-muted text-[13px] font-semibold">Choose a member to book for.</div>
      )}
      {!memberMissing && nights > 0 && validation.valid && (
        <div className="text-sm font-semibold" style={{ color: 'var(--color-accent-2-700)' }}>
          {nights} night{nights === 1 ? '' : 's'} at the cabin
        </div>
      )}
      {!memberMissing && !validation.valid && (
        <div className="text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
          {validation.reason}
        </div>
      )}
      {/* Same-day turnover: allowed, but flag it so the two parties coordinate.
          Advisory only — the Confirm button stays enabled. */}
      {!memberMissing && validation.valid && validation.warnings.length > 0 && (
        <div
          className="flex flex-col gap-1 px-3 py-2.5 text-[13px] font-semibold"
          style={{
            background: 'var(--color-warning-100)',
            border: '1px solid var(--color-warning-300)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-warning-800)',
          }}
        >
          {validation.warnings.map((w) => {
            const who =
              reservations.find((r) => r.id === w.otherReservationId)?.userName ?? 'the other party'
            const base =
              w.code === 'TURNOVER_CHECKIN'
                ? 'Your check-in is the same day another stay checks out.'
                : 'Your check-out is the same day another stay checks in.'
            return (
              <div key={w.otherReservationId + w.code}>
                ⚠ {base} You can still book it — coordinate arrival and departure with {who}.
              </div>
            )
          })}
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
          disabled={!validation.valid || submitting || memberMissing}
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
