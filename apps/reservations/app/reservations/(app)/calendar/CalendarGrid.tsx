'use client'

import { useMemo } from 'react'
import { computeDayInfo } from './dayInfo'
import { isDayInSelection } from './dayInSelection'
import { colorForUser } from './reservationColor'
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

    for (let day = 1; day <= total; day++) {
      const date = toISODate(year, month, day)
      const info = computeDayInfo(date, reservations, blockedDates, bookingRules)
      const isInSelection = isDayInSelection(date, selectionStart, selectionEnd, hoverDate)

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
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onPrevMonth} className="rounded px-3 py-1 hover:bg-stone-100" aria-label="Previous month">
          &larr;
        </button>
        <h2 className="text-base font-semibold text-stone-900 sm:text-lg">{monthLabel}</h2>
        <button onClick={onNextMonth} className="rounded px-3 py-1 hover:bg-stone-100" aria-label="Next month">
          &rarr;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const color = day.bookedByUserId ? colorForUser(day.bookedByUserId) : null
          const disabled = day.isBlocked || day.bookedByUserId !== null || day.isPastHorizon
          return (
            <button
              key={day.date}
              type="button"
              disabled={disabled}
              onClick={() => onDayClick(day.date)}
              onMouseEnter={() => onDayHover(day.date)}
              onMouseLeave={() => onDayHover(null)}
              className={[
                'flex h-14 flex-col items-center justify-center overflow-hidden rounded border p-1 text-xs sm:h-16',
                color
                  ? `cursor-not-allowed border-transparent ${color.bg} ${color.text}`
                  : disabled
                    ? 'cursor-not-allowed bg-stone-100 text-stone-400'
                    : 'cursor-pointer hover:bg-lake-50',
                !color && day.isInSelection ? 'bg-lake-200' : '',
                !color && day.isSelectionStart ? 'ring-2 ring-lake-600' : '',
              ].join(' ')}
            >
              <span>{Number(day.date.slice(-2))}</span>
              {day.bookedByName && (
                <span className="line-clamp-2 text-center text-[9px] leading-tight sm:text-[10px]">
                  {day.bookedByName}
                </span>
              )}
              {day.isBlocked && !day.bookedByName && <span className="text-[10px]">Blocked</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
