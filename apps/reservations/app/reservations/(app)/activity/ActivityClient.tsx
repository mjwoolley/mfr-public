'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { formatActivityMessage, type ActivityEvent, type UserNameMap } from '@/lib/activity/formatMessage'

interface ActivityPage {
  events: ActivityEvent[]
  users: UserNameMap
  nextCursor: string | null
}

async function fetchActivityPage(cursor: string | null): Promise<ActivityPage> {
  const url = cursor ? `/reservations/api/activity?before=${encodeURIComponent(cursor)}` : '/reservations/api/activity'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load activity')
  return res.json()
}

export function ActivityClient() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['activity'],
    queryFn: ({ pageParam }: { pageParam: string | null }) => fetchActivityPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: ActivityPage) => lastPage.nextCursor,
  })

  if (isLoading) return <p className="p-8 text-center text-stone-500">Loading...</p>
  if (error) return <p className="p-8 text-center text-red-600">Failed to load activity.</p>

  const pages = data?.pages ?? []
  const users: UserNameMap = pages.reduce((acc, page) => ({ ...acc, ...page.users }), {} as UserNameMap)
  const events = pages.flatMap((page) => page.events)

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Activity</h1>
      {events.length === 0 && <p className="text-stone-500">No activity yet.</p>}
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id} className="rounded border p-3">
            <p className="text-stone-900">{formatActivityMessage(event, users)}</p>
            <p className="mt-1 text-xs text-stone-500">{new Date(event.createdAt).toLocaleString()}</p>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 w-full rounded border px-4 py-2 text-sm font-medium text-lake-700 hover:bg-lake-50 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}
