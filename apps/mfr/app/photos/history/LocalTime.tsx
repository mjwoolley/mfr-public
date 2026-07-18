'use client'

// Renders a timestamp in the viewer's own locale/timezone. Server-rendering the
// date would format it in the server's timezone; formatting on the client keeps
// "who did what when" honest for each family member. Renders the raw ISO on the
// server (and first client render) then swaps to the localized string once
// hydrated — useSyncExternalStore does this without a hydration mismatch and
// without setState-in-effect.

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

export function LocalTime({ iso }: { iso: string }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return <time dateTime={iso}>{isClient ? new Date(iso).toLocaleString() : iso}</time>
}
