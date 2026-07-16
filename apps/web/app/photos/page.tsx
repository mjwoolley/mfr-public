import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { requireApproved } from '@/lib/authz'
import { getPhotoAlbums, getPortalSettings } from '@/lib/portal'

export const metadata: Metadata = { title: 'Photos' }

export default async function PhotosPage() {
  await requireApproved()
  const [albums, settings] = await Promise.all([getPhotoAlbums(), getPortalSettings()])

  return (
    <section className="mx-auto max-w-5xl px-7 pt-6 pb-2" style={{ animation: 'fadeup .4s ease both' }}>
      <div className="mb-2 flex flex-wrap items-end gap-5">
        <div>
          <div className="text-xs font-bold uppercase" style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}>
            Family album
          </div>
          <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
            Photos, year by year.
          </h1>
          <p className="mt-3 max-w-xl" style={{ fontSize: 16, lineHeight: 1.65, color: 'color-mix(in srgb, var(--color-text) 78%, transparent)' }}>
            Every reunion has its own shared Google&nbsp;Photos album. Open any year to look through
            the pictures &mdash; and if you have access, add your own straight from your phone.
          </p>
        </div>
        {settings.highlightsUrl && (
          <a
            href={settings.highlightsUrl}
            target="_blank"
            rel="noopener"
            className="btn btn-primary ml-auto"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            Open highlights album
          </a>
        )}
      </div>

      <div className="mt-6 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {albums.map((al, i) => {
          const hasUrl = !!al.url.trim()
          return (
            <div key={al.id} className="albumcard card elev-sm bg-white overflow-hidden" style={{ padding: 0, gap: 0 }}>
              <div className="washed relative w-full overflow-hidden" style={{ aspectRatio: '4 / 3', background: 'var(--color-neutral-200)' }}>
                {i === 0 ? (
                  <Image src="/lake-house.jpg" alt={`${al.year} album cover`} fill sizes="300px" style={{ objectFit: 'cover' }} />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{ background: 'var(--color-accent-2-100)', fontFamily: 'var(--font-heading)', fontSize: 34, color: 'var(--color-accent-2-700)' }}
                  >
                    {al.year}
                  </div>
                )}
              </div>
              <div style={{ padding: '16px 18px 18px' }}>
                <div className="flex items-baseline justify-between gap-2.5">
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>{al.year}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
                    {hasUrl ? 'Shared album' : 'Not linked'}
                  </span>
                </div>
                {hasUrl ? (
                  <div className="mt-3 flex gap-4">
                    <a href={al.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 700 }}>
                      View
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 17 L17 7" />
                        <path d="M8 7h9v9" />
                      </svg>
                    </a>
                    <a href={al.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-accent-2-700)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add photos
                    </a>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <span style={{ fontSize: 13.5, color: 'var(--color-neutral-600)' }}>No album linked yet.</span>
                    <Link href="/admin" style={{ fontSize: 13.5, fontWeight: 700 }}>
                      Add link
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
