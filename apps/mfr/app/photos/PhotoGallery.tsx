'use client'

// The member photo gallery: a natural-shape masonry of tiles grouped into
// titled sections (a year, or an uploader with year sub-breaks). Each tile a
// member can manage carries two glass controls — a top-left select circle
// (whole-page multi-select → the sticky Delete bar) and a top-right star circle
// (Feature on home, capped per uploader). Clicking a tile opens a lightbox with
// the full photo and Feature / Edit / Delete / Close buttons. Owners manage their
// own photos; content-admins manage anyone's (enforced again in the actions).

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { GalleryPhoto, PhotoSection } from '@/lib/photos/gallery'
import { updatePhoto, deletePhoto, deletePhotos, setFeatured } from './actions'

function fmtSize(bytes: number) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function StarIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
    >
      <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.36 6.19 20.9 7.3 14.43 2.6 9.85l6.5-.95z" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  )
}

export function PhotoGallery({
  sections,
  currentUserId,
  isContentAdmin,
  showMeta = false,
}: {
  sections: PhotoSection[]
  currentUserId: string
  isContentAdmin: boolean
  showMeta?: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Flat, in-render-order photo list — the lightbox indexes into it, and tiles
  // look up their own index by id.
  const flat = useMemo(() => sections.flatMap((s) => s.blocks.flatMap((b) => b.photos)), [sections])
  const indexById = useMemo(() => {
    const m = new Map<string, number>()
    flat.forEach((p, i) => m.set(p.id, i))
    return m
  }, [flat])

  const isOpen = active !== null
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // Auto-dismiss the transient toast (e.g. the feature-cap message).
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4500)
    return () => clearTimeout(t)
  }, [message])

  const photo = active !== null ? flat[active] : null
  const canEdit = !!photo && (photo.uploadedBy === currentUserId || isContentAdmin)
  const isOwner = !!photo && photo.uploadedBy === currentUserId

  function canManage(p: GalleryPhoto) {
    return p.uploadedBy === currentUserId || isContentAdmin
  }
  // Owner toggles their own; a content-admin may unfeature anyone's (moderation).
  function canToggleFeature(p: GalleryPhoto) {
    return p.uploadedBy === currentUserId || (isContentAdmin && p.featured)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  function toggleFeature(p: GalleryPhoto) {
    setMessage(null)
    start(async () => {
      const res = await setFeatured(p.id, !p.featured)
      if ('error' in res) {
        setMessage(res.error)
        return
      }
      router.refresh()
    })
  }

  function deleteSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (
      !confirm(
        `Delete ${ids.length} photo${ids.length === 1 ? '' : 's'}? Backups are kept for 30 days.`,
      )
    )
      return
    setMessage(null)
    start(async () => {
      const res = await deletePhotos(ids)
      if ('error' in res) {
        setMessage(res.error)
        return
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  function closeLightbox() {
    setActive(null)
    setEditing(false)
    setError(null)
  }

  function renderTile(p: GalleryPhoto) {
    const idx = indexById.get(p.id) ?? 0
    const selectable = canManage(p)
    const isSelected = selected.has(p.id)
    return (
      <figure
        key={p.id}
        className="relative m-0 mb-3"
        style={{ breakInside: 'avoid', WebkitColumnBreakInside: 'avoid' } as CSSProperties}
      >
        <button
          type="button"
          onClick={() => {
            setActive(idx)
            setError(null)
          }}
          className="card elev-sm relative block w-full cursor-zoom-in overflow-hidden p-0"
          style={{
            background: 'var(--color-neutral-200)',
            border: 'none',
            outline: isSelected ? '3px solid var(--color-accent)' : undefined,
            outlineOffset: isSelected ? -3 : undefined,
          }}
          aria-label={p.caption ?? `Photo from ${p.year}`}
        >
          <Image
            src={p.blobUrl}
            alt={p.caption ?? `Photo from ${p.year}`}
            width={p.width || 4}
            height={p.height || 3}
            sizes="(max-width: 640px) 45vw, 200px"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </button>

        {selectable && (
          <button
            type="button"
            onClick={() => toggleSelect(p.id)}
            aria-pressed={isSelected}
            aria-label={isSelected ? 'Deselect photo' : 'Select photo'}
            title={isSelected ? 'Deselect' : 'Select'}
            className="absolute left-1.5 top-1.5 flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              border: '2px solid #fff',
              color: '#fff',
              background: isSelected
                ? 'var(--color-accent)'
                : 'color-mix(in srgb, #000 18%, transparent)',
              boxShadow: '0 1px 4px rgba(0,0,0,.4)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {isSelected && <CheckIcon />}
          </button>
        )}

        {canToggleFeature(p) && (
          <button
            type="button"
            onClick={() => toggleFeature(p)}
            disabled={pending}
            aria-pressed={p.featured}
            aria-label={p.featured ? 'Unfeature photo' : 'Feature on home'}
            title={p.featured ? 'Featured on the home page' : 'Feature on home'}
            className="absolute right-1.5 top-1.5 flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              border: 'none',
              // Not featured: just a white star floating over the photo (glass,
              // like the select circle). Featured: a filled sage circle = "on".
              background: p.featured ? 'var(--color-accent-2-600)' : 'transparent',
              color: '#fff',
              boxShadow: p.featured ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
              filter: p.featured ? 'none' : 'drop-shadow(0 1px 2px rgba(0,0,0,.55))',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <StarIcon />
          </button>
        )}

        {p.caption && (
          <figcaption
            className="mt-1 line-clamp-2"
            style={{ fontSize: 12.5, lineHeight: 1.35, color: 'var(--color-neutral-700)' }}
            title={p.caption}
          >
            {p.caption}
          </figcaption>
        )}
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
    )
  }

  return (
    <>
      {selected.size > 0 && (
        <div
          className="card elev-md bg-white sticky z-20 mb-4 flex flex-wrap items-center gap-3"
          style={{ top: 8, padding: '10px 14px', flexDirection: 'row' }}
        >
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="btn btn-icon btn-secondary"
            aria-label="Clear selection"
            title="Clear selection"
          >
            <CloseIcon />
          </button>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{selected.size} selected</span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={pending}
            className="btn btn-secondary ml-auto"
            style={{ color: 'var(--color-accent-700)', fontWeight: 700 }}
          >
            <TrashIcon />
            Delete
          </button>
        </div>
      )}

      {message && (
        <div
          className="mb-4"
          role="status"
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: 'var(--color-accent-800)',
            background: 'var(--color-accent-100)',
            border: '1px solid var(--color-accent-300)',
            borderRadius: 'var(--radius-md)',
            padding: '9px 14px',
          }}
        >
          {message}
        </div>
      )}

      {sections.map((section) => (
        <div key={section.id} className="mb-8">
          {section.title && (
            <h2 className="mb-3 text-[20px]">
              {section.title}
              {section.subtitle && (
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-neutral-600)' }}>
                  {' '}
                  · {section.subtitle}
                </span>
              )}
            </h2>
          )}
          {section.blocks.map((block, bi) => (
            <div key={block.label ?? bi} className={block.label ? 'mb-4' : undefined}>
              {block.label && (
                <div
                  className="mb-2 text-xs font-bold uppercase"
                  style={{ letterSpacing: '.14em', color: 'var(--color-accent-700)' }}
                >
                  {block.label}
                </div>
              )}
              <div style={{ columnWidth: 160, columnGap: 12 }}>{block.photos.map(renderTile)}</div>
            </div>
          ))}
        </div>
      ))}

      {photo &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={closeLightbox}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,.85)' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="card bg-white flex w-full flex-col overflow-auto"
              style={{ padding: 16, maxWidth: 'min(1100px, 96vw)', maxHeight: '96vh' }}
            >
              <div
                className="relative w-full"
                style={{
                  aspectRatio: `${photo.width || 4} / ${photo.height || 3}`,
                  maxHeight: '78vh',
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
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>
                  {photo.year}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
                  {photo.filename || 'photo'} · {photo.width}×{photo.height}
                  {photo.byteSize ? ` · ${fmtSize(photo.byteSize)}` : ''}
                </span>
              </div>
              {photo.caption && !editing && (
                <p className="mt-1" style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>
                  {photo.caption}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(isOwner || (isContentAdmin && photo.featured)) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => run(() => setFeatured(photo.id, !photo.featured))}
                  >
                    {photo.featured ? (
                      'Unfeature'
                    ) : (
                      <>
                        <StarIcon /> Feature on home
                      </>
                    )}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => setEditing((v) => !v)}
                  >
                    {editing ? 'Cancel edit' : 'Edit'}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    style={{ color: 'var(--color-accent-700)' }}
                    onClick={() => {
                      if (confirm('Delete this photo? Its backup is kept for 30 days.')) {
                        run(() => deletePhoto(photo.id), true)
                      }
                    }}
                  >
                    <TrashIcon />
                    Delete
                  </button>
                )}
                <button type="button" className="btn btn-secondary ml-auto" onClick={closeLightbox}>
                  <CloseIcon />
                  Close
                </button>
              </div>

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
          </div>,
          document.body,
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
