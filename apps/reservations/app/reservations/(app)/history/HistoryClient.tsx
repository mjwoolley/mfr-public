'use client'

import { useQuery } from '@tanstack/react-query'

interface HistoryReservation {
  id: string
  userId: string
  userName: string | null
  startDate: string
  endDate: string
  status: 'confirmed' | 'cancelled'
}

interface UserGroup {
  userId: string
  userName: string
  upcoming: HistoryReservation[]
  past: HistoryReservation[]
}

function groupByUser(reservationsList: HistoryReservation[]): UserGroup[] {
  const today = new Date().toISOString().slice(0, 10)
  const groups = new Map<string, UserGroup>()

  for (const r of reservationsList) {
    if (!groups.has(r.userId)) {
      groups.set(r.userId, { userId: r.userId, userName: r.userName ?? 'Unknown user', upcoming: [], past: [] })
    }
    const group = groups.get(r.userId)!
    if (r.startDate >= today) {
      group.upcoming.push(r)
    } else {
      group.past.push(r)
    }
  }

  for (const group of groups.values()) {
    group.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate))
    group.past.sort((a, b) => b.startDate.localeCompare(a.startDate))
  }

  return [...groups.values()].sort((a, b) => a.userName.localeCompare(b.userName))
}

function ReservationLine({ r }: { r: HistoryReservation }) {
  return (
    <li className="text-sm text-stone-700">
      {r.startDate} &rarr; {r.endDate}
      {r.status === 'cancelled' ? ' (cancelled)' : ''}
    </li>
  )
}

export function HistoryClient() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['history'],
    queryFn: async (): Promise<HistoryReservation[]> => {
      const res = await fetch('/reservations/api/history')
      if (!res.ok) throw new Error('Failed to load history')
      const body = await res.json()
      return body.reservations
    },
  })

  if (isLoading) return <p className="p-8 text-center text-stone-500">Loading...</p>
  if (error) return <p className="p-8 text-center text-red-600">Failed to load history.</p>

  const groups = groupByUser(data ?? [])

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Reservation History</h1>
      {groups.length === 0 && <p className="text-stone-500">No reservations yet.</p>}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.userId} className="rounded border p-3">
            <h2 className="mb-2 font-medium text-stone-900">{group.userName}</h2>
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
