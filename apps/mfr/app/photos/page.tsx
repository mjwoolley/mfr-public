// Albums — the family photo browse surface. One list of member photos, shown as
// a masonry grouped either By Year or By Uploader (a client toggle, no reload).
// Add photos from here; each is filed under the year it was taken and stays
// editable. Featured picks and the change history are their own sub-nav pages.

import type { Metadata } from 'next'
import { canManagePortalContent } from '@mfr/auth'
import { requireApproved } from '@/lib/authz'
import { getPortalSettings } from '@/lib/portal'
import { getAlbumSections } from '@/lib/photos/gallery'
import { GalleryUploader } from './GalleryUploader'
import { AlbumsView } from './AlbumsView'

export const metadata: Metadata = { title: 'Albums' }

export default async function PhotosPage() {
  const session = await requireApproved()
  const [settings, { byYear, byUploader }] = await Promise.all([
    getPortalSettings(),
    getAlbumSections(session.user.id),
  ])
  const isContentAdmin = canManagePortalContent(session.user.roles)

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>Albums</h1>
      <p
        className="mt-2 max-w-xl"
        style={{
          fontSize: 16,
          lineHeight: 1.6,
          color: 'color-mix(in srgb, var(--color-text) 78%, transparent)',
        }}
      >
        Add your photos straight from your phone &mdash; each one is filed under the year it was
        taken. Browse by year, or by who added them.
      </p>

      <div className="mb-6 mt-5">
        <GalleryUploader year={settings.reunionYear} />
        <p className="mt-2" style={{ fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
          JPEG, PNG, WebP, GIF or HEIC (iPhone). Photos are filed by their capture date; large
          photos are resized and your location data is removed automatically.
        </p>
      </div>

      <AlbumsView
        byYear={byYear}
        byUploader={byUploader}
        currentUserId={session.user.id}
        isContentAdmin={isContentAdmin}
      />
    </section>
  )
}
