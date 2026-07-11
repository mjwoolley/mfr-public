'use client'

import { useQuery } from '@tanstack/react-query'
import { nightsBetween } from '@/lib/rules/dateHelpers'
import { groupByUser, type SummaryReservation } from './summaryGrouping'

function ReservationLine({ r }: { r: SummaryReservation }) {
  return (
    <li className="flex items-baseline justify-between gap-4 text-sm text-stone-700">
      <span>
        {r.startDate} &rarr; {r.endDate}
      </span>
      <span className="text-stone-500">{nightsBetween(r.startDate, r.endDate)} nights</span>
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

  if (isLoading) return <p className="p-8 text-center text-stone-500">Loading...</p>
  if (error) return <p className="p-8 text-center text-red-600">Failed to load reservation summary.</p>

  const today = new Date().toISOString().slice(0, 10)
  const groups = groupByUser(data ?? [], today)

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Reservation Summary</h1>
      {groups.length === 0 && <p className="text-stone-500">No reservations yet.</p>}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.userId} className="rounded border p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-medium text-stone-900">{group.userName}</h2>
              <span className="text-xs text-stone-500">
                {group.upcomingNights} upcoming &middot; {group.pastNights} past &middot; {group.totalNights} total nights
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-semibold text-stone-500 uppercase">Upcoming</h3>
                {group.upcoming.length === 0 ? (
                  <p className="text-sm text-stone-500">None</p>
                ) : (
                  <ul className="space-y-1">
                    {group.upcoming.map((r) => (
                      <ReservationLine key={r.id} r={r} />
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-stone-500 uppercase">Past</h3>
                {group.past.length === 0 ? (
                  <p className="text-sm text-stone-500">None</p>
                ) : (
                  <ul className="space-y-1">
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
