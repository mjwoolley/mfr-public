'use client'

// Uniform-tile photo grid with a lightbox. All tiles render the same size
// (square, cover-cropped); the full image + metadata + owner/admin controls live
// in the lightbox. Owners can feature (≤ cap, enforced server-side), edit
// year/caption, and delete; content-admins can unfeature/delete anyone's.

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { GalleryPhoto } from '@/lib/photos/gallery'
import { updatePhoto, deletePhoto, setFeatured } from './actions'

function fmtSize(bytes: number) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function GalleryGrid({
  photos,
  currentUserId,
  isContentAdmin,
  showMeta = false,
}: {
  photos: GalleryPhoto[]
  currentUserId: string
  isContentAdmin: boolean
  showMeta?: boolean
}) {
  const router = useRouter()
  const [active, setActive] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  if (photos.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>
        No photos yet — be the first to add some.
      </p>
    )
  }

  const photo = active !== null ? photos[active] : null
  const canEdit = !!photo && (photo.uploadedBy === currentUserId || isContentAdmin)
  const isOwner = !!photo && photo.uploadedBy === currentUserId

  function run(fn: () => Promise<{ ok: true } | { error: string }>, thenClose = false) {
    setError(null)
    start(async () => {
      const res = await fn()
      if ('error' in res) {
        setError(res.error)
        return
      }
      setEditing(false)
      if (thenClose) setActive(null)
      router.refresh()
    })
  }

  function close() {
    setActive(null)
    setEditing(false)
    setError(null)
  }

  return (
    <>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
      >
        {photos.map((p, i) => (
          <figure key={p.id} className="m-0">
            <button
              type="button"
              onClick={() => {
                setActive(i)
                setError(null)
              }}
              className="card elev-sm relative block w-full cursor-zoom-in overflow-hidden p-0"
              style={{
                aspectRatio: '1 / 1',
                background: 'var(--color-neutral-200)',
                border: 'none',
              }}
              aria-label={p.caption ?? `Photo from ${p.year}`}
            >
              <Image
                src={p.blobUrl}
                alt={p.caption ?? `Photo from ${p.year}`}
                fill
                sizes="(max-width: 640px) 45vw, 200px"
                style={{ objectFit: 'cover' }}
              />
              {p.featured && (
                <span
                  className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'var(--color-accent-2-500)', color: '#fff' }}
                  title="Featured on the home page"
                >
                  ★
                </span>
              )}
            </button>
            {showMeta && (
              <figcaption
                className="mt-1"
                style={{ fontSize: 11.5, lineHeight: 1.35, color: 'var(--color-neutral-600)' }}
              >
                <span style={{ fontWeight: 700 }}>{p.year}</span> · {p.filename || 'photo'}
                <br />
                {p.width}×{p.height}
                {p.byteSize ? ` · ${fmtSize(p.byteSize)}` : ''}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {photo && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.8)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card bg-white flex max-h-[92vh] w-full max-w-3xl flex-col overflow-auto"
            style={{ padding: 16 }}
          >
            <div
              className="relative w-full"
              style={{
                aspectRatio: `${photo.width || 4} / ${photo.height || 3}`,
                maxHeight: '62vh',
              }}
            >
              <Image
                src={photo.blobUrl}
                alt={photo.caption ?? `Photo from ${photo.year}`}
                fill
                sizes="768px"
                style={{ objectFit: 'contain' }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{photo.year}</span>
              <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
                {photo.filename || 'photo'} · {photo.width}×{photo.height}
                {photo.byteSize ? ` · ${fmtSize(photo.byteSize)}` : ''}
              </span>
              <button
                type="button"
                onClick={close}
                className="btn btn-icon ml-auto"
                title="Close"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {photo.caption && !editing && (
              <p className="mt-1" style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>
                {photo.caption}
              </p>
            )}

            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isOwner && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => run(() => setFeatured(photo.id, !photo.featured))}
                  >
                    {photo.featured ? 'Unfeature' : '★ Feature on home'}
                  </button>
                )}
                {!isOwner && isContentAdmin && photo.featured && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => run(() => setFeatured(photo.id, false))}
                  >
                    Unfeature
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? 'Cancel edit' : 'Edit'}
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  disabled={pending}
                  title="Delete photo"
                  style={{ color: 'var(--color-accent-700)', marginLeft: 'auto' }}
                  onClick={() => {
                    if (confirm('Delete this photo? Its backup is kept for 30 days.')) {
                      run(() => deletePhoto(photo.id), true)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            )}

            {editing && canEdit && (
              <EditForm
                key={photo.id}
                photo={photo}
                pending={pending}
                onSave={(fields) => run(() => updatePhoto(photo.id, fields))}
              />
            )}

            {error && (
              <p className="mt-2" style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function EditForm({
  photo,
  pending,
  onSave,
}: {
  photo: GalleryPhoto
  pending: boolean
  onSave: (fields: { year?: number; caption?: string }) => void
}) {
  const [year, setYear] = useState(String(photo.year))
  const [caption, setCaption] = useState(photo.caption ?? '')
  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 700 }}>
        Year
        <input
          className="input"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ width: 110 }}
        />
      </label>
      <label className="flex flex-col gap-1" style={{ fontSize: 13, fontWeight: 700 }}>
        Caption
        <textarea
          className="input"
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-primary self-start"
        disabled={pending}
        onClick={() => onSave({ year: Number(year), caption })}
      >
        Save changes
      </button>
    </div>
  )
}
