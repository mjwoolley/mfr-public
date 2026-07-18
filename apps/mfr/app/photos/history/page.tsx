// Photos history: a members-only feed of who added, deleted, captioned, or
// featured photos. Reads the shared activity_log (filtered to photo events) via
// getPhotoHistory and renders each through formatPhotoEvent. Server-rendered
// (newest 100); timestamps localize on the client via <LocalTime>.

import type { Metadata } from 'next'
import Link from 'next/link'
import { requireApproved } from '@/lib/authz'
import { getPhotoHistory } from '@/lib/photos/history'
import { formatPhotoEvent } from '@/lib/photos/formatHistory'
import { LocalTime } from './LocalTime'

export const metadata: Metadata = { title: 'Photo history' }

export default async function PhotoHistoryPage() {
  await requireApproved()
  const { events, users } = await getPhotoHistory()

  return (
    <section
      className="mx-auto max-w-3xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div className="mb-4">
        <Link
          href="/photos"
          className="text-xs font-bold uppercase"
          style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
        >
          &larr; All years
        </Link>
        <h1 className="mt-2.5" style={{ fontSize: 'clamp(30px,4vw,42px)', lineHeight: 1.05 }}>
          Photo history
        </h1>
        <p className="mt-2" style={{ fontSize: 14.5, color: 'var(--color-neutral-600)' }}>
          Who added, removed, captioned, or featured photos.
        </p>
      </div>

      {events.length === 0 ? (
        <div
          className="p-12 text-center"
          style={{
            fontSize: 15,
            color: 'var(--color-neutral-600)',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          Nothing yet — photo changes will show up here.
        </div>
      ) : (
        <div className="card elev-sm bg-white px-1 py-2" style={{ gap: 0 }}>
          {events.map((event) => {
            const name = (event.actorUserId && users[event.actorUserId]) || 'S'
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
                  {name.charAt(0)}
                </span>
                <div className="flex-1 text-sm">{formatPhotoEvent(event, users)}</div>
                <span className="flex-none text-xs" style={{ color: 'var(--color-neutral-600)' }}>
                  <LocalTime iso={event.createdAt} />
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
