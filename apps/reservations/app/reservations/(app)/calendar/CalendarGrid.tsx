'use client'

import { useMemo } from 'react'
import { computeDayInfo, type DayInfo } from './dayInfo'
import { isDayInSelection } from './dayInSelection'
import { reservationTone } from './tones'
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface CalendarGridProps {
  year: number
  month: number // 0-11
  userId: string
  reservations: ReservationRow[]
  blockedDates: BlockedDateRow[]
  bookingRules: BookingRulesRow
  selectionStart: string | null
  selectionEnd: string | null
  hoverDate: string | null
  onDayClick: (date: string, info: DayInfo) => void
  onDayHover: (date: string | null) => void
}

export function CalendarGrid({
  year,
  month,
  userId,
  reservations,
  blockedDates,
  bookingRules,
  selectionStart,
  selectionEnd,
  hoverDate,
  onDayClick,
  onDayHover,
}: CalendarGridProps) {
  const today = todayISO()

  const days = useMemo(() => {
    const total = daysInMonth(year, month)
    const result: Array<
      { date: string; isSelectionStart: boolean; isInSelection: boolean } & DayInfo
    > = []

    for (let day = 1; day <= total; day++) {
      const date = toISODate(year, month, day)
      const info = computeDayInfo(date, reservations, blockedDates, bookingRules)
      const isInSelection = isDayInSelection(date, selectionStart, selectionEnd, hoverDate)

      result.push({ date, ...info, isInSelection, isSelectionStart: date === selectionStart })
    }
    return result
  }, [
    year,
    month,
    reservations,
    blockedDates,
    bookingRules,
    selectionStart,
    selectionEnd,
    hoverDate,
  ])

  const leadingBlanks = firstWeekdayOfMonth(year, month)

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            className="text-muted py-0.5 text-center text-[11px] font-bold tracking-[0.08em] uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const booked = day.reservationId !== null
          const tone = booked ? reservationTone(day.bookedByUserId === userId) : null
          const disabled = !booked && (day.isBlocked || day.isPastHorizon)
          const isToday = day.date === today

          let background = 'var(--color-neutral-100)'
          if (tone) background = tone.fill
          if (day.isInSelection) background = 'var(--color-accent-200)'
          if (disabled) background = 'var(--color-neutral-200)'

          return (
            <button
              key={day.date}
              type="button"
              disabled={disabled}
              onClick={() => onDayClick(day.date, day)}
              onMouseEnter={() => onDayHover(day.date)}
              onMouseLeave={() => onDayHover(null)}
              className={`daycell relative flex flex-col items-start gap-[3px] overflow-hidden p-2 text-left transition-[box-shadow,transform] duration-100 ${
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
              style={{
                minHeight: 'clamp(60px, 8.5vw, 92px)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid transparent',
                background,
                color: 'var(--color-text)',
                boxShadow:
                  isToday || day.isInSelection || day.isSelectionStart
                    ? 'inset 0 0 0 2px var(--color-accent)'
                    : undefined,
              }}
            >
              {tone && (
                <span
                  className="absolute top-0 bottom-0 left-0 w-[5px]"
                  style={{ background: tone.bar }}
                />
              )}
              <span
                className="text-sm font-bold"
                style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-text)' }}
              >
                {Number(day.date.slice(-2))}
              </span>
              {day.isReservationStart && day.bookedByName && tone && (
                <span
                  className="mt-auto max-w-full overflow-hidden text-[11px] font-semibold text-ellipsis whitespace-nowrap"
                  style={{ color: tone.ink }}
                >
                  {day.bookedByName}
                </span>
              )}
              {day.isBlocked && !booked && (
                <span className="text-muted mt-auto text-[10px]">Blocked</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
