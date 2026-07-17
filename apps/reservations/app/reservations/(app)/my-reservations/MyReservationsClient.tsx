'use client'

// My Reservations: the member's own upcoming and past stays with book/edit/
// cancel actions and their nights-used-this-year count. Reuses the calendar's
// data hook and dialogs rather than its own fetch layer.

import { useState } from 'react'
import { BookingPanel } from '../calendar/BookingPanel'
import { ReservationViewDialog } from '../calendar/ReservationViewDialog'
import { useCalendarData, type ReservationRow } from '../calendar/useCalendarData'
import { useReservationMutations } from '../calendar/useReservationMutations'
import { niceRange, nightsLabel } from '../calendar/formatDates'
import { reservationTone } from '../calendar/tones'
import { addDays } from '@/lib/rules/dateHelpers'

type Modal =
  | { mode: 'create'; start: string; end: string }
  | { mode: 'view'; reservationId: string }
  | { mode: 'edit'; reservationId: string }
  | null

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function MyReservationsClient({ userId }: { userId: string }) {
  const [modal, setModal] = useState<Modal>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const { reservations, blockedDates, bookingRules, isLoading, error } = useCalendarData()
  const { cancelReservation } = useReservationMutations()

  if (isLoading) return <p className="text-muted p-8 text-center">Loading...</p>
  if (error || !bookingRules) {
    return (
      <p className="p-8 text-center font-semibold" style={{ color: 'var(--color-accent-800)' }}>
        Failed to load your reservations.
      </p>
    )
  }

  const today = todayISO()
  const mine = reservations
    .filter((r) => r.status === 'confirmed' && r.userId === userId && r.endDate > today)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))

  const tone = reservationTone(true)

  const selected: ReservationRow | null =
    modal && (modal.mode === 'view' || modal.mode === 'edit')
      ? (reservations.find((r) => r.id === modal.reservationId) ?? null)
      : null

  async function handleCancel(id: string) {
    setCancellingId(id)
    setCancelError(null)
    const result = await cancelReservation(id)
    setCancellingId(null)
    if (!result.ok) {
      setCancelError(result.error ?? 'Something went wrong.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-7 pb-16 sm:px-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-4xl">My reservations</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const start = todayISO()
            setModal({ mode: 'create', start, end: addDays(start, 2) })
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New reservation
        </button>
      </div>

      {mine.length === 0 ? (
        <div
          className="text-muted p-12 text-center text-[15px]"
          style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}
        >
          No reservations yet. Pick your dates on the calendar to book the cabin.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cancelError && (
            <div className="text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
              {cancelError}
            </div>
          )}
          {mine.map((r) => (
            <div
              key={r.id}
              className="rowcard card elev-sm bg-white px-5 py-4"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}
            >
              <button
                type="button"
                onClick={() => setModal({ mode: 'view', reservationId: r.id })}
                className="flex flex-1 cursor-pointer items-center gap-[18px] border-0 bg-transparent p-0 text-left"
              >
                <span
                  className="w-1.5 flex-none self-stretch rounded-full"
                  style={{ background: tone.bar }}
                />
                <div className="flex-1">
                  <div
                    className="text-[19px] leading-tight"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {niceRange(r.startDate, r.endDate)}
                  </div>
                  <div className="text-muted mt-1 text-[13px]">
                    {nightsLabel(r.startDate, r.endDate)}
                  </div>
                </div>
                <span className={r.startDate <= today ? 'tag tag-accent' : 'tag tag-outline'}>
                  {r.startDate <= today ? 'In progress' : 'Upcoming'}
                </span>
              </button>
              <div className="flex flex-none items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModal({ mode: 'edit', reservationId: r.id })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: 'var(--color-accent-800)' }}
                  onClick={() => handleCancel(r.id)}
                  disabled={cancellingId === r.id}
                >
                  {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal?.mode === 'create' && (
        <BookingPanel
          userId={userId}
          initialStart={modal.start}
          initialEnd={modal.end}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          onClose={() => setModal(null)}
          onSubmitted={() => setModal(null)}
        />
      )}

      {modal?.mode === 'view' && selected && (
        <ReservationViewDialog
          reservation={selected}
          isOwn={selected.userId === userId}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ mode: 'edit', reservationId: selected.id })}
          onCancelled={() => setModal(null)}
        />
      )}

      {modal?.mode === 'edit' && selected && (
        <BookingPanel
          userId={userId}
          editReservationId={selected.id}
          initialStart={selected.startDate}
          initialEnd={selected.endDate}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          onClose={() => setModal(null)}
          onSubmitted={() => setModal(null)}
        />
      )}
    </div>
  )
}
