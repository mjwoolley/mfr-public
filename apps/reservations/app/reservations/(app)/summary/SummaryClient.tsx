'use client'

// Reservations Summary: everyone's confirmed stays for the current calendar
// year grouped per person (upcoming vs past — see summaryGrouping.ts), fed by
// the purpose-built /api/history endpoint.

import { useQuery } from '@tanstack/react-query'
import { nightsBetween } from '@/lib/rules/dateHelpers'
import { niceRange } from '../calendar/formatDates'
import { groupByUser, type SummaryReservation } from './summaryGrouping'

function ReservationLine({ r }: { r: SummaryReservation }) {
  return (
    <li className="flex items-baseline justify-between gap-4 text-sm">
      <span>{niceRange(r.startDate, r.endDate)}</span>
      <span className="text-muted">{nightsBetween(r.startDate, r.endDate)} nights</span>
    </li>
  )
}

export function SummaryClient() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reservation-summary'],
    queryFn: async (): Promise<SummaryReservation[]> => {
      const res = await fetch('/reservations/api/history')
      if (!res.ok) throw new Error('Failed to load reservation summary')
      const body = await res.json()
      return body.reservations
    },
  })

  if (isLoading) return <p className="text-muted p-8 text-center">Loading...</p>
  if (error) {
    return (
      <p className="p-8 text-center font-semibold" style={{ color: 'var(--color-accent-800)' }}>
        Failed to load reservation summary.
      </p>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const groups = groupByUser(data ?? [], today)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-7 pb-16 sm:px-7">
      <h1 className="mb-5 text-4xl">Reservations Summary</h1>
      {groups.length === 0 && (
        <div
          className="text-muted p-12 text-center text-[15px]"
          style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}
        >
          No reservations yet.
        </div>
      )}
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.userId} className="card elev-sm bg-white px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-sm"
                style={{
                  background: 'var(--color-accent-100)',
                  color: 'var(--color-accent-700)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                {(group.userName ?? '?').charAt(0)}
              </span>
              <h2 className="m-0 text-[19px]">{group.userName}</h2>
              <span className="text-muted ml-auto text-[13px]">
                {group.upcomingNights} upcoming &middot; {group.pastNights} past &middot;{' '}
                {group.totalNights} total nights
              </span>
            </div>
            <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3
                  className="text-muted mb-1 text-[11px] font-bold tracking-[0.08em] uppercase"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Upcoming
                </h3>
                {group.upcoming.length === 0 ? (
                  <p className="text-muted m-0 text-sm">None</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {group.upcoming.map((r) => (
                      <ReservationLine key={r.id} r={r} />
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3
                  className="text-muted mb-1 text-[11px] font-bold tracking-[0.08em] uppercase"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Past
                </h3>
                {group.past.length === 0 ? (
                  <p className="text-muted m-0 text-sm">None</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {group.past.map((r) => (
                      <ReservationLine key={r.id} r={r} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
