'use client'

import { useState } from 'react'
import { CalendarGrid } from './CalendarGrid'
import { BookingPanel } from './BookingPanel'
import { useCalendarData } from './useCalendarData'

interface CalendarClientProps {
  userId: string
}

export function CalendarClient({ userId }: CalendarClientProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getUTCFullYear())
  const [month, setMonth] = useState(today.getUTCMonth())
  const [selectionStart, setSelectionStart] = useState<string | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const { reservations, blockedDates, bookingRules, isLoading, error, refetchAll } = useCalendarData()

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

  function handleDayClick(date: string) {
    if (!selectionStart) {
      setSelectionStart(date)
      return
    }
    if (!selectionEnd) {
      const start = selectionStart < date ? selectionStart : date
      const end = selectionStart < date ? date : selectionStart
      setSelectionStart(start)
      setSelectionEnd(end)
      return
    }
    setSelectionStart(date)
    setSelectionEnd(null)
  }

  function resetSelection() {
    setSelectionStart(null)
    setSelectionEnd(null)
    setHoverDate(null)
  }

  if (isLoading || !bookingRules) {
    return <p className="p-8 text-center text-stone-500">Loading calendar...</p>
  }
  if (error) {
    return <p className="p-8 text-center text-red-600">Failed to load the calendar. Please refresh.</p>
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <CalendarGrid
        year={year}
        month={month}
        reservations={reservations}
        blockedDates={blockedDates}
        bookingRules={bookingRules}
        selectionStart={selectionStart}
        selectionEnd={selectionEnd}
        hoverDate={hoverDate}
        onDayClick={handleDayClick}
        onDayHover={setHoverDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />
      {selectionStart && selectionEnd && (
        <BookingPanel
          userId={userId}
          startDate={selectionStart}
          endDate={selectionEnd}
          reservations={reservations}
          blockedDates={blockedDates}
          bookingRules={bookingRules}
          onCancel={resetSelection}
          onSubmitted={() => {
            resetSelection()
            refetchAll()
          }}
        />
      )}
    </div>
  )
}
