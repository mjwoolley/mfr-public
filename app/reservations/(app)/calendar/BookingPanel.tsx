'use client'

import { useMemo, useState } from 'react'
import { validateReservation, type ExistingReservation } from '@/lib/rules/validateReservation'
import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

interface BookingPanelProps {
  userId: string
  startDate: string
  endDate: string
  reservations: ReservationRow[]
  blockedDates: BlockedDateRow[]
  bookingRules: BookingRulesRow
  onCancel: () => void
  onSubmitted: () => void
}

export function BookingPanel({
  userId,
  startDate,
  endDate,
  reservations,
  blockedDates,
  bookingRules,
  onCancel,
  onSubmitted,
}: BookingPanelProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
      existingReservations: existing,
      blockedDates: blockedDates.map((b) => ({ startDate: b.startDate, endDate: b.endDate })),
      bookingRules: {
        bookingHorizonDate: bookingRules.bookingHorizonDate,
        maxConsecutiveNights: bookingRules.maxConsecutiveNights,
        maxNightsPerUserPerYear: bookingRules.maxNightsPerUserPerYear,
      },
    })
  }, [userId, startDate, endDate, reservations, blockedDates, bookingRules])

  const nights = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  }, [startDate, endDate])

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await fetch('/reservations/api/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setSubmitError(body.error ?? 'Failed to create reservation.')
        return
      }
      onSubmitted()
    } catch {
      setSubmitError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Confirm your stay</h3>
        <p className="mb-4 text-sm text-gray-600">
          {startDate} &rarr; {endDate} ({nights} night{nights === 1 ? '' : 's'})
        </p>
        {!validation.valid && (
          <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">{validation.reason}</p>
        )}
        {submitError && <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!validation.valid || submitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Booking...' : 'Book these dates'}
          </button>
        </div>
      </div>
    </div>
  )
}
