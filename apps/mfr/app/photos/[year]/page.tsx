// One reunion year's in-site member gallery: browse the year's photos (uniform
// tiles + lightbox) and upload your own. Members-only.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { canManagePortalContent } from '@mfr/auth'
import { requireApproved } from '@/lib/authz'
import { getPhotosByYear } from '@/lib/photos/gallery'
import { GalleryGrid } from '../GalleryGrid'
import { GalleryUploader } from '../GalleryUploader'

export const metadata: Metadata = { title: 'Photos' }

export default async function YearGalleryPage({ params }: { params: Promise<{ year: string }> }) {
  const session = await requireApproved()
  const { year: yearStr } = await params
  if (!/^\d{4}$/.test(yearStr)) notFound()
  const year = Number(yearStr)

  const photos = await getPhotosByYear(year)
  const isContentAdmin = canManagePortalContent(session.user.roles)

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <Link
            href="/photos"
            className="text-xs font-bold uppercase"
            style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
          >
            &larr; All years
          </Link>
          <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
            {year} photos
          </h1>
        </div>
        <Link href="/photos/people" className="ml-auto" style={{ fontSize: 13, fontWeight: 600 }}>
          Browse by person &rarr;
        </Link>
      </div>

      <div className="mb-5">
        <GalleryUploader year={year} />
        <p className="mt-2" style={{ fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
          JPEG, PNG, WebP, GIF or HEIC (iPhone). Large photos are resized; your location data is
          removed automatically.
        </p>
      </div>

      <GalleryGrid
        photos={photos}
        currentUserId={session.user.id}
        isContentAdmin={isContentAdmin}
      />
    </section>
  )
}
