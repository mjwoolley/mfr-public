// Members-only Photos page: one card per reunion year linking into that year's
// in-site gallery (portal_photos), plus links to the Featured picks and the
// change history.

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { requireApproved } from '@/lib/authz'
import { getPhotoAlbums } from '@/lib/portal'
import { getSlidesByCollection } from '@/lib/photos/slides'
import { getYearSummaries } from '@/lib/photos/gallery'

export const metadata: Metadata = { title: 'Photos' }

export default async function PhotosPage() {
  await requireApproved()
  const [albums, slidesByYear, yearSummaries] = await Promise.all([
    getPhotoAlbums(),
    getSlidesByCollection(),
    getYearSummaries(),
  ])

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div className="mb-2 flex flex-wrap items-end gap-5">
        <div>
          <div
            className="text-xs font-bold uppercase"
            style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
          >
            Family album
          </div>
          <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
            Photos, year by year.
          </h1>
          <p
            className="mt-3 max-w-xl"
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: 'color-mix(in srgb, var(--color-text) 78%, transparent)',
            }}
          >
            Every reunion has its own album. Open any year to look through the pictures &mdash; and
            add your own straight from your phone.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-4 self-center">
          <Link href="/photos/people" style={{ fontSize: 13.5, fontWeight: 700 }}>
            Browse by person &rarr;
          </Link>
          <Link href="/photos/history" style={{ fontSize: 13.5, fontWeight: 700 }}>
            History &rarr;
          </Link>
          <Link
            href="/photos/featured"
            className="btn btn-primary"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
              aria-hidden
            >
              <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.36 6.19 20.9 7.3 14.43 2.6 9.85l6.5-.95z" />
            </svg>
            Open Featured
          </Link>
        </div>
      </div>

      <div
        className="mt-6 grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}
      >
        {albums.map((al, i) => {
          const slides = slidesByYear.get(String(al.year)) ?? []
          const summary = yearSummaries.get(al.year)
          // One static cover per album — the year's real cover if it has photos,
          // else the first admin slide, else the lake-house fallback (first card
          // only), else the year as text. (No rotation here: you click in to see
          // the rest of the album.)
          const coverUrl =
            summary?.coverUrl ?? slides[0]?.blobUrl ?? (i === 0 ? '/lake-house.jpg' : null)
          return (
            <div
              key={al.id}
              className="albumcard card elev-sm bg-white overflow-hidden"
              style={{ padding: 0, gap: 0 }}
            >
              <Link
                href={`/photos/${al.year}`}
                className="washed relative block w-full overflow-hidden"
                style={{ aspectRatio: '4 / 3', background: 'var(--color-neutral-200)' }}
                aria-label={`Open ${al.year} photos`}
              >
                {coverUrl ? (
                  <Image
                    src={coverUrl}
                    alt={`${al.year} album cover`}
                    fill
                    sizes="300px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{
                      background: 'var(--color-accent-2-100)',
                      fontFamily: 'var(--font-heading)',
                      fontSize: 34,
                      color: 'var(--color-accent-2-700)',
                    }}
                  >
                    {al.year}
                  </div>
                )}
              </Link>
              <div style={{ padding: '16px 18px 18px' }}>
                <div className="flex items-baseline justify-between gap-2.5">
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>{al.year}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
                    {summary
                      ? `${summary.count} photo${summary.count === 1 ? '' : 's'}`
                      : 'No photos yet'}
                  </span>
                </div>
                <div className="mt-3">
                  <Link href={`/photos/${al.year}`} style={{ fontSize: 14, fontWeight: 700 }}>
                    Open gallery &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
