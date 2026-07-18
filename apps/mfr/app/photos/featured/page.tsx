// The "Featured" gallery: every photo the family has starred (★ Feature on
// home), most-recently-featured first. Same uniform-tile grid + lightbox as a
// year gallery, so owners/admins can unfeature, edit, or delete right here.
// Members-only.

import type { Metadata } from 'next'
import Link from 'next/link'
import { canManagePortalContent } from '@mfr/auth'
import { requireApproved } from '@/lib/authz'
import { getFeaturedPhotos } from '@/lib/photos/gallery'
import { GalleryGrid } from '../GalleryGrid'

export const metadata: Metadata = { title: 'Featured photos' }

export default async function FeaturedPage() {
  const session = await requireApproved()
  const photos = await getFeaturedPhotos()
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
            Featured
          </h1>
          <p className="mt-2" style={{ fontSize: 14.5, color: 'var(--color-neutral-600)' }}>
            The family&rsquo;s picks. Open any photo and choose &ldquo;Feature on home&rdquo; to add
            your own.
          </p>
        </div>
      </div>

      {photos.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>
          No featured photos yet. Open a photo in any year&rsquo;s gallery and choose &ldquo;★
          Feature on home&rdquo; to add it here.
        </p>
      ) : (
        <GalleryGrid
          photos={photos}
          currentUserId={session.user.id}
          isContentAdmin={isContentAdmin}
        />
      )}
    </section>
  )
}
