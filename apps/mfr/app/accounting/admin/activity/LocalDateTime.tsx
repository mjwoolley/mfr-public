'use client'

// Renders an entry timestamp in the viewer's own locale/timezone — same
// useSyncExternalStore pattern as app/photos/history/LocalTime.tsx (raw ISO on
// the server and first client render, localized string once hydrated, no
// hydration mismatch). Local, not shared: this feed wants the compact
// medium-date/short-time format rather than toLocaleString()'s default.
//
// Unlike the business dates on these cards (noon-UTC calendar days, rendered
// via the UTC-pinned formatDate), an entry time is a real instant, so the
// viewer's zone is the honest one to show it in.

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

export function LocalDateTime({ iso }: { iso: string }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return (
    <time dateTime={iso}>
      {isClient
        ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        : iso}
    </time>
  )
}
