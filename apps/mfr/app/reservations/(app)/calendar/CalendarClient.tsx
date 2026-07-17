'use client'

// The calendar page orchestrator: month navigation, the two-click date
// selection state (see calendarSelection.ts), grid/list mode toggle, and the
// create/view/edit dialogs. Data comes from useCalendarData (React Query).

import { useState } from 'react'
import { CalendarGrid } from './CalendarGrid'
import { BookingPanel } from './BookingPanel'
import { ListView } from './ListView'
import { ReservationViewDialog } from './ReservationViewDialog'
import { useCalendarData, type ReservationRow } from './useCalendarData'
import { computeSelectionAfterClick } from './calendarSelection'
import { addDays, nightsBetween } from '@/lib/reservations/rules/dateHelpers'
import { niceDate } from './formatDates'
import type { DayInfo } from './dayInfo'

interface CalendarClientProps {
  userId: string
}

type CalMode = 'month' | 'list'

type Modal =
  | { mode: 'create'; start: string; end: string }
  | { mode: 'view'; reservationId: string }
  | { mode: 'edit'; reservationId: string }
  | null

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CalendarClient({ userId }: CalendarClientProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getUTCFullYear())
  const [month, setMonth] = useState(today.getUTCMonth())
  const [calMode, setCalMode] = useState<CalMode>('month')
  const [selectionStart, setSelectionStart] = useState<string | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)

  const { reservations, blockedDates, bookingRules, isLoading, error } = useCalendarData()

  function handlePrevMonth() {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function handleDayClick(date: string, info: DayInfo) {
    if (info.reservationId) {
      setModal({ mode: 'view', reservationId: info.reservationId })
      return
    }
    const next = computeSelectionAfterClick({ selectionStart, selectionEnd }, date)
    setSelectionStart(next.selectionStart)
    setSelectionEnd(next.selectionEnd)
    if (next.selectionStart && next.selectionEnd) {
      setModal({ mode: 'create', start: next.selectionStart, end: next.selectionEnd })
    }
  }

  function resetSelection() {
    setSelectionStart(null)
    setSelectionEnd(null)
    setHoverDate(null)
  }

  function openNewReservation() {
    const start = todayISO()
    const end = addDays(start, 2)
    setCalMode('month')
    setSelectionStart(start)
    setSelectionEnd(end)
    setModal({ mode: 'create', start, end })
  }

  if (isLoading) {
    return <p className="text-muted p-8 text-center">Loading calendar...</p>
  }
  if (error) {
    return (
      <p className="p-8 text-center font-semibold" style={{ color: 'var(--color-accent-800)' }}>
        Failed to load the calendar. Please refresh.
      </p>
    )
  }
  if (!bookingRules) {
    // Fresh environment: the booking_rules row hasn't been created yet.
    return (
      <p className="text-muted p-8 text-center">
        The calendar isn&rsquo;t set up yet — an admin needs to configure booking rules under Admin
        &rarr; Booking Rules.
      </p>
    )
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const viewedReservation: ReservationRow | null =
    modal && (modal.mode === 'view' || modal.mode === 'edit')
      ? (reservations.find((r) => r.id === modal.reservationId) ?? null)
      : null

  const selectionLabel = !selectionStart
    ? ''
    : selectionEnd
      ? `Selected: ${niceDate(selectionStart)} → ${niceDate(addDays(selectionEnd, -1))}  (${nightsBetween(selectionStart, selectionEnd)} night${nightsBetween(selectionStart, selectionEnd) === 1 ? '' : 's'})`
      : `Check-in ${niceDate(selectionStart)} — now pick a check-out date`

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-7 pb-16 sm:px-7">
      {/* header: cabin kicker + month nav + view toggle + new reservation */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="text-muted mb-1.5 text-xs tracking-[0.09em] uppercase">
            Miller Family Lake Cabin
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <h1 className="m-0 min-w-[230px] text-center text-[32px] sm:text-[40px]">
              {monthLabel}
            </h1>
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="seg" style={{ background: 'var(--color-surface)' }}>
            <label className="seg-opt">
              <input
                type="radio"
                name="calendar-view-mode"
                checked={calMode === 'month'}
                onChange={() => setCalMode('month')}
              />
              Month
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="calendar-view-mode"
                checked={calMode === 'list'}
                onChange={() => setCalMode('list')}
              />
              List
            </label>
          </div>
          <button type="button" className="btn btn-primary" onClick={openNewReservation}>
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
      </div>

      {/* legend */}
      <div className="mb-4 flex flex-wrap items-center gap-5">
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <span
            className="h-[15px] w-[15px] rounded-[5px]"
            style={{
              background: 'var(--color-neutral-100)',
              border: '1px solid var(--color-divider)',
            }}
          />
          Available
        </span>
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <span
            className="h-[15px] w-[15px] rounded-[5px]"
            style={{ background: 'var(--color-accent)' }}
          />
          Your stay
        </span>
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <span
            className="h-[15px] w-[15px] rounded-[5px]"
            style={{ background: 'var(--color-accent-2)' }}
          />
          Booked by family
        </span>
      </div>

      {/* selection banner / hint */}
      {selectionStart ? (
        <div
          className="mb-4 flex items-center gap-3.5 px-4 py-3 text-sm"
          style={{
            background: 'var(--color-accent-100)',
            border: '1px solid var(--color-accent-300)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent-700)"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span className="font-semibold" style={{ color: 'var(--color-accent-800)' }}>
            {selectionLabel}
          </span>
          <button type="button" className="btn btn-ghost ml-auto" onClick={resetSelection}>
            Clear
          </button>
        </div>
      ) : (
        <div className="text-muted mb-4 text-sm">
          Pick a check-in date, then a check-out date to reserve the cabin — or hit{' '}
          <strong style={{ color: 'var(--color-text)' }}>New reservation</strong>.
        </div>
      )}

      {calMode === 'month' ? (
        <CalendarGrid
          year={year}
          month={month}
          userId={userId}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          hoverDate={hoverDate}
          onDayClick={handleDayClick}
          onDayHover={setHoverDate}
        />
      ) : (
        <ListView
          reservations={reservations}
          year={year}
          month={month}
          userId={userId}
          onView={(r) => setModal({ mode: 'view', reservationId: r.id })}
        />
      )}

      {modal?.mode === 'create' && (
        <BookingPanel
          userId={userId}
          initialStart={modal.start}
          initialEnd={modal.end}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          onClose={() => {
            setModal(null)
            resetSelection()
          }}
          onSubmitted={() => {
            setModal(null)
            resetSelection()
          }}
        />
      )}

      {modal?.mode === 'view' && viewedReservation && (
        <ReservationViewDialog
          reservation={viewedReservation}
          isOwn={viewedReservation.userId === userId}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ mode: 'edit', reservationId: viewedReservation.id })}
          onCancelled={() => setModal(null)}
        />
      )}

      {modal?.mode === 'edit' && viewedReservation && (
        <BookingPanel
          userId={userId}
          editReservationId={viewedReservation.id}
          initialStart={viewedReservation.startDate}
          initialEnd={viewedReservation.endDate}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          onClose={() => setModal(null)}
          onSubmitted={() => {
            setModal(null)
            resetSelection()
          }}
        />
      )}
    </div>
  )
}
