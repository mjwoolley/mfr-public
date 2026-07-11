'use client'

import { useState } from 'react'
import { BookingPanel } from '../../../calendar/BookingPanel'
import { useCalendarData, type ReservationRow } from '../../../calendar/useCalendarData'
import { useReservationMutations } from '../../../calendar/useReservationMutations'
import { niceRange, nightsLabel } from '../../../calendar/formatDates'
import { reservationTone } from '../../../calendar/tones'

export function AdminReservationsClient({ adminUserId }: { adminUserId: string }) {
  const [editing, setEditing] = useState<ReservationRow | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const { reservations, blockedDates, bookingRules, isLoading, error } = useCalendarData()
  const { cancelReservation } = useReservationMutations()

  async function handleCancel(id: string) {
    setCancellingId(id)
    setRowError((prev) => (prev?.id === id ? null : prev))
    const result = await cancelReservation(id)
    setCancellingId(null)
    if (!result.ok) {
      setRowError({ id, message: result.error ?? 'Failed to cancel reservation.' })
    }
  }

  if (isLoading) return <p className="text-muted p-8 text-center">Loading...</p>
  if (error || !bookingRules) {
    return (
      <p className="p-8 text-center font-semibold" style={{ color: 'var(--color-accent-800)' }}>
        Failed to load reservations.
      </p>
    )
  }

  const sorted = reservations
    .filter((r) => r.status === 'confirmed')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  return (
    <div>
      <p className="text-muted mb-4 text-sm">View, edit, or cancel any family reservation.</p>
      {sorted.length === 0 && (
        <div
          className="text-muted p-12 text-center text-[15px]"
          style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}
        >
          No reservations in range.
        </div>
      )}
      <div className="flex flex-col gap-3">
        {sorted.map((r) => {
          const tone = reservationTone(r.userId === adminUserId)
          return (
            <div
              key={r.id}
              className="rowcard card elev-sm bg-white px-5 py-4"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
            >
              <span
                className="w-[5px] flex-none self-stretch rounded-full"
                style={{ background: tone.bar }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>
                  {niceRange(r.startDate, r.endDate)}
                </div>
                <div className="text-muted mt-0.5 text-[13px]">
                  {r.userName ?? 'Unknown user'} · {nightsLabel(r.startDate, r.endDate)}
                </div>
                {rowError?.id === r.id && (
                  <p className="m-0 mt-1 text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
                    {rowError.message}
                  </p>
                )}
              </div>
              <button type="button" className="btn btn-secondary flex-none" onClick={() => setEditing(r)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-secondary flex-none"
                style={{ color: 'var(--color-accent-800)' }}
                onClick={() => handleCancel(r.id)}
                disabled={cancellingId === r.id}
              >
                {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          )
        })}
      </div>

      {editing && (
        <BookingPanel
          // Validate against the reservation owner's caps, not the admin's.
          userId={editing.userId}
          editReservationId={editing.id}
          initialStart={editing.startDate}
          initialEnd={editing.endDate}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          onClose={() => setEditing(null)}
          onSubmitted={() => setEditing(null)}
        />
      )}
    </div>
  )
}
