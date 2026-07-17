// Admin dashboard: composes the four content panels (schedule, links,
// albums, events) and shows the Users link only to the site owner.

import type { Metadata } from 'next'
import Link from 'next/link'
import { canManageUsers } from '@mfr/auth'
import { auth } from '@/lib/auth'
import { getPortalSettings, getPhotoAlbums, getEvents } from '@/lib/portal'
import { ScheduleForm, LinksForm, AlbumsEditor, EventsEditor } from './AdminPanels'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminPage() {
  const session = await auth()
  const isOwner = session?.user?.roles ? canManageUsers(session.user.roles) : false
  const [settings, albums, events] = await Promise.all([
    getPortalSettings(),
    getPhotoAlbums(),
    getEvents(),
  ])

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div
        className="text-xs font-bold uppercase"
        style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
      >
        Admin
      </div>
      <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
        Site settings.
      </h1>
      <p
        className="mt-3 max-w-[620px]"
        style={{
          fontSize: 16,
          lineHeight: 1.65,
          color: 'color-mix(in srgb, var(--color-text) 78%, transparent)',
        }}
      >
        Manage the pieces family members see. Changes here update the Home, Meals, and Photos pages
        right away.
      </p>

      {isOwner && (
        <Link
          href="/admin/users"
          className="card elev-sm bg-white mt-6 flex items-center gap-4 no-underline"
          style={{ padding: '18px 22px' }}
        >
          <span
            className="flex items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: 'var(--color-accent-100)',
              color: 'var(--color-accent-700)',
            }}
            aria-hidden
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <div className="flex-1">
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>User management</div>
            <div style={{ fontSize: 13.5, color: 'var(--color-neutral-600)' }}>
              Approve or block members and assign roles &mdash; site owner only.
            </div>
          </div>
          <span aria-hidden style={{ color: 'var(--color-accent-700)', fontWeight: 700 }}>
            &rarr;
          </span>
        </Link>
      )}

      <div
        className="mt-6 grid items-start gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}
      >
        <ScheduleForm
          reunionYear={settings.reunionYear}
          reunionStart={settings.reunionStart}
          reunionEnd={settings.reunionEnd}
        />
        <LinksForm
          highlightsUrl={settings.highlightsUrl}
          driveUrl={settings.driveUrl}
          venmoUrl={settings.venmoUrl}
          chatUrl={settings.chatUrl}
        />
        <AlbumsEditor albums={albums.map((a) => ({ id: a.id, year: a.year, url: a.url }))} />
        <EventsEditor
          events={events.map((e) => ({
            id: e.id,
            startDate: e.startDate,
            endDate: e.endDate,
            time: e.time,
            description: e.description,
            meetingLink: e.meetingLink,
          }))}
        />
      </div>
    </section>
  )
}
