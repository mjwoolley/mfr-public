'use client'

import { niceRange, nightsLabel } from './formatDates'
import { reservationTone } from './tones'
import { reservationsStartingInMonth } from './listGrouping'
import type { ReservationRow } from './useCalendarData'

interface ListViewProps {
  reservations: ReservationRow[]
  year: number
  month: number // 0-11
  userId: string
  onView: (reservation: ReservationRow) => void
}

/** The calendar's List mode: this month's stays as tappable row cards. */
export function ListView({ reservations, year, month, userId, onView }: ListViewProps) {
  const rows = reservationsStartingInMonth(reservations, year, month)

  if (rows.length === 0) {
    return (
      <div
        className="text-muted p-12 text-center text-[15px]"
        style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}
      >
        The cabin is wide open this month. Switch to Month view and pick your dates.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const isOwn = r.userId === userId
        const tone = reservationTone(isOwn)
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onView(r)}
            className="rowcard card elev-sm cursor-pointer bg-white px-5 py-4 text-left"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}
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
                {r.userName ?? 'Family'} · {nightsLabel(r.startDate, r.endDate)}
              </div>
            </div>
            <span className={tone.tagClass}>{tone.tagLabel}</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-neutral-500)"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )
      })}
    </div>
  )
}
