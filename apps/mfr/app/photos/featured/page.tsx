// The "Featured" gallery: every photo the family has starred, most-recently-
// featured first. Same tile grid + lightbox as Albums, so owners/admins can
// unfeature, edit, or delete right here. Members-only.

import type { Metadata } from 'next'
import { canManagePortalContent } from '@mfr/auth'
import { requireApproved } from '@/lib/authz'
import { getFeaturedPhotos } from '@/lib/photos/gallery'
import { PhotoGallery } from '../PhotoGallery'

export const metadata: Metadata = { title: 'Featured' }

export default async function FeaturedPage() {
  const session = await requireApproved()
  const photos = await getFeaturedPhotos()
  const isContentAdmin = canManagePortalContent(session.user.roles)

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>Featured</h1>
      <p className="mb-6 mt-2" style={{ fontSize: 14.5, color: 'var(--color-neutral-600)' }}>
        The family&rsquo;s picks. Tap the star on any photo to feature it on the home page.
      </p>

      {photos.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>
          No featured photos yet. Tap the star on any photo in Albums to add it here.
        </p>
      ) : (
        <PhotoGallery
          sections={[{ id: 'featured', blocks: [{ photos }] }]}
          currentUserId={session.user.id}
          isContentAdmin={isContentAdmin}
        />
      )}
    </section>
  )
}
