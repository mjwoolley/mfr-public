'use client'

// The Albums browse view: a client-side toggle between "By Year" and "By
// Uploader" that flips which pre-built section list feeds the gallery — no page
// reload, no refetch (both groupings come from the server page). By Uploader
// shows each person's photos broken up by year, with the file meta.

import { useState } from 'react'
import type { PhotoSection } from '@/lib/photos/gallery'
import { PhotoGallery } from './PhotoGallery'

export function AlbumsView({
  byYear,
  byUploader,
  currentUserId,
  isContentAdmin,
}: {
  byYear: PhotoSection[]
  byUploader: PhotoSection[]
  currentUserId: string
  isContentAdmin: boolean
}) {
  const [view, setView] = useState<'year' | 'uploader'>('year')
  const sections = view === 'year' ? byYear : byUploader

  return (
    <>
      <div className="seg mb-6" style={{ background: 'var(--color-surface)' }}>
        <label className="seg-opt">
          <input
            type="radio"
            name="albums-view"
            checked={view === 'year'}
            onChange={() => setView('year')}
          />
          By Year
        </label>
        <label className="seg-opt">
          <input
            type="radio"
            name="albums-view"
            checked={view === 'uploader'}
            onChange={() => setView('uploader')}
          />
          By Uploader
        </label>
      </div>

      {sections.length === 0 ? (
        <p style={{ fontSize: 15, color: 'var(--color-neutral-600)' }}>
          No photos yet &mdash; add the first ones above.
        </p>
      ) : (
        <PhotoGallery
          sections={sections}
          currentUserId={currentUserId}
          isContentAdmin={isContentAdmin}
          showMeta={view === 'uploader'}
        />
      )}
    </>
  )
}
