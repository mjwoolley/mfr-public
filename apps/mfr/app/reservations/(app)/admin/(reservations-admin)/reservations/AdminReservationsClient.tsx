'use client'

// Admin all-reservations screen: every member's upcoming stays with edit and
// cancel on their behalf (the API allows either the owner or an admin).

import { useState } from 'react'
import { BookingPanel } from '../../../calendar/BookingPanel'
import { useCalendarData, type ReservationRow } from '../../../calendar/useCalendarData'
import { useReservationMutations } from '../../../calendar/useReservationMutations'
import { niceRange, nightsLabel } from '../../../calendar/formatDates'
import { reservationTone } from '../../../calendar/tones'
import { addDays, todayISO } from '@/lib/reservations/rules/dateHelpers'

interface Member {
  id: string
  name: string | null
}

export function AdminReservationsClient({
  adminUserId,
  members,
}: {
  adminUserId: string
  members: Member[]
}) {
  const [editing, setEditing] = useState<ReservationRow | null>(null)
  const [creating, setCreating] = useState(false)
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-muted text-sm">
          View, edit, cancel, or create a reservation for any family member.
        </p>
        <button
          type="button"
          className="btn btn-primary flex-none"
          onClick={() => setCreating(true)}
        >
          New reservation
        </button>
      </div>
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
                  <p
                    className="m-0 mt-1 text-[13px] font-semibold"
                    style={{ color: 'var(--color-accent-800)' }}
                  >
                    {rowError.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary flex-none"
                onClick={() => setEditing(r)}
              >
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

      {creating && bookingRules && (
        <BookingPanel
          // adminUserId is only a fallback; the member picker supplies the owner.
          userId={adminUserId}
          isAdmin
          members={members}
          initialStart={todayISO()}
          initialEnd={addDays(todayISO(), 1)}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          onClose={() => setCreating(false)}
          onSubmitted={() => setCreating(false)}
        />
      )}

      {editing && (
        <BookingPanel
          // Validate against the reservation owner's caps, not the admin's.
          userId={editing.userId}
          // This route is reservations-admin-gated, so the actor is always an
          // admin — and admins bypass the new-reservation past-date rule.
          isAdmin
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
