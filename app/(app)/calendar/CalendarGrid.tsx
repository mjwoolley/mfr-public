'use client'

import { useMemo } from 'react'
import { computeDayInfo } from './dayInfo'
import type { ReservationRow, BlockedDateRow, BookingRulesRow } from './useCalendarData'

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay()
}

interface CalendarGridProps {
  year: number
  month: number // 0-11
  reservations: ReservationRow[]
  blockedDates: BlockedDateRow[]
  bookingRules: BookingRulesRow
  selectionStart: string | null
  selectionEnd: string | null
  hoverDate: string | null
  onDayClick: (date: string) => void
  onDayHover: (date: string | null) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

export function CalendarGrid({
  year,
  month,
  reservations,
  blockedDates,
  bookingRules,
  selectionStart,
  selectionEnd,
  hoverDate,
  onDayClick,
  onDayHover,
  onPrevMonth,
  onNextMonth,
}: CalendarGridProps) {
  const days = useMemo(() => {
    const total = daysInMonth(year, month)
    const result: Array<{ date: string; isSelectionStart: boolean; isInSelection: boolean } & ReturnType<typeof computeDayInfo>> = []
    const rangeOtherEnd = selectionEnd ?? hoverDate

    for (let day = 1; day <= total; day++) {
      const date = toISODate(year, month, day)
      const info = computeDayInfo(date, reservations, blockedDates, bookingRules)

      let isInSelection = false
      if (selectionStart && rangeOtherEnd) {
        const lo = selectionStart < rangeOtherEnd ? selectionStart : rangeOtherEnd
        const hi = selectionStart < rangeOtherEnd ? rangeOtherEnd : selectionStart
        isInSelection = date >= lo && date <= hi
      }

      result.push({ date, ...info, isInSelection, isSelectionStart: date === selectionStart })
    }
    return result
  }, [year, month, reservations, blockedDates, bookingRules, selectionStart, selectionEnd, hoverDate])

  const leadingBlanks = firstWeekdayOfMonth(year, month)
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onPrevMonth} className="rounded px-3 py-1 hover:bg-gray-100" aria-label="Previous month">
          &larr;
        </button>
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <button onClick={onNextMonth} className="rounded px-3 py-1 hover:bg-gray-100" aria-label="Next month">
          &rarr;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const disabled = day.isBlocked || day.bookedByName !== null || day.isPastHorizon
          return (
            <button
              key={day.date}
              type="button"
              disabled={disabled}
              onClick={() => onDayClick(day.date)}
              onMouseEnter={() => onDayHover(day.date)}
              onMouseLeave={() => onDayHover(null)}
              className={[
                'flex h-16 flex-col items-center justify-center rounded border p-1 text-xs',
                disabled ? 'cursor-not-allowed bg-gray-100 text-gray-400' : 'cursor-pointer hover:bg-blue-50',
                day.isInSelection ? 'bg-blue-200' : '',
                day.isSelectionStart ? 'ring-2 ring-blue-600' : '',
              ].join(' ')}
            >
              <span>{Number(day.date.slice(-2))}</span>
              {day.bookedByName && <span className="truncate text-[10px]">{day.bookedByName}</span>}
              {day.isBlocked && !day.bookedByName && <span className="text-[10px]">Blocked</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
