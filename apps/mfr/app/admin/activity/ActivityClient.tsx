'use client'

// Activity feed: paged list of activity_log events via useInfiniteQuery,
// paging on the API's `nextCursor` and rendering each event through
// formatActivityMessage. Carries its own QueryClientProvider — it is the only
// React Query consumer under /admin, so no layout-level provider exists here.

import { useState } from 'react'
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query'
import {
  formatActivityMessage,
  type ActivityEvent,
  type UserNameMap,
} from '@/lib/reservations/activity/formatMessage'

interface ActivityPage {
  events: ActivityEvent[]
  users: UserNameMap
  nextCursor: string | null
}

async function fetchActivityPage(cursor: string | null): Promise<ActivityPage> {
  const url = cursor
    ? `/api/admin/activity?before=${encodeURIComponent(cursor)}`
    : '/api/admin/activity'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load activity')
  return res.json()
}

function ActivityFeed() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['activity'],
      queryFn: ({ pageParam }: { pageParam: string | null }) => fetchActivityPage(pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage: ActivityPage) => lastPage.nextCursor,
    })

  if (isLoading) return <p className="text-muted p-8 text-center">Loading...</p>
  if (error) {
    return (
      <p className="p-8 text-center font-semibold" style={{ color: 'var(--color-accent-800)' }}>
        Failed to load activity.
      </p>
    )
  }

  const pages = data?.pages ?? []
  const users: UserNameMap = pages.reduce(
    (acc, page) => ({ ...acc, ...page.users }),
    {} as UserNameMap,
  )
  const events = pages.flatMap((page) => page.events)

  return (
    <div className="w-full max-w-3xl">
      {events.length === 0 && (
        <div
          className="text-muted p-12 text-center text-[15px]"
          style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}
        >
          No activity yet.
        </div>
      )}
      {events.length > 0 && (
        <div className="card elev-sm bg-white px-1 py-2" style={{ gap: 0 }}>
          {events.map((event) => {
            const actorName = (event.actorUserId && users[event.actorUserId]) || 'S'
            return (
              <div
                key={event.id}
                className="flex items-center gap-3.5 px-4 py-3.5"
                style={{ borderBottom: '1px solid var(--color-divider)' }}
              >
                <span
                  className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-sm"
                  style={{
                    background: 'var(--color-accent-100)',
                    color: 'var(--color-accent-700)',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {actorName.charAt(0)}
                </span>
                <div className="flex-1 text-sm">{formatActivityMessage(event, users)}</div>
                <span className="text-muted flex-none text-xs">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="btn btn-secondary btn-block mt-4"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}

export function ActivityClient() {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <ActivityFeed />
    </QueryClientProvider>
  )
}
