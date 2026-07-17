'use client'

import { useState } from 'react'
import { ModalDialog } from '@mfr/ui'
import { niceRange, nightsLabel } from './formatDates'
import { reservationTone } from './tones'
import { useReservationMutations } from './useReservationMutations'
import type { ReservationRow } from './useCalendarData'

interface ReservationViewDialogProps {
  reservation: ReservationRow
  isOwn: boolean
  onClose: () => void
  /** Switch to the edit dialog for this reservation (own stays only). */
  onEdit: () => void
  onCancelled: () => void
}

/**
 * Read-only reservation details, opened by clicking a booked day or a list
 * row. Edit and Cancel appear only on the viewer's own stays — the same
 * ownership rule the API enforces.
 */
export function ReservationViewDialog({
  reservation,
  isOwn,
  onClose,
  onEdit,
  onCancelled,
}: ReservationViewDialogProps) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { cancelReservation } = useReservationMutations()
  const tone = reservationTone(isOwn)

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    const result = await cancelReservation(reservation.id)
    setCancelling(false)
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.')
      return
    }
    onCancelled()
  }

  return (
    <ModalDialog title="Reservation" onClose={onClose}>
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 flex-none rounded-full" style={{ background: tone.bar }} />
        <span className="text-xl" style={{ fontFamily: 'var(--font-heading)' }}>
          {reservation.userName ?? 'Family'}
        </span>
        <span className={tone.tagClass}>{tone.tagLabel}</span>
      </div>
      <div className="text-[26px] leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
        {niceRange(reservation.startDate, reservation.endDate)}
      </div>
      <div>
        <div className="text-muted text-[11px] tracking-[0.06em] uppercase">Nights</div>
        <div className="text-base font-semibold">
          {nightsLabel(reservation.startDate, reservation.endDate)}
        </div>
      </div>
      {error && (
        <div className="text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
          {error}
        </div>
      )}
      <div className="dialog-actions items-center">
        {isOwn && (
          <button
            type="button"
            className="btn btn-secondary mr-auto"
            style={{ color: 'var(--color-accent-800)' }}
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling…' : 'Cancel reservation'}
          </button>
        )}
        {isOwn && (
          <button type="button" className="btn btn-secondary" onClick={onEdit}>
            Edit
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalDialog>
  )
}
