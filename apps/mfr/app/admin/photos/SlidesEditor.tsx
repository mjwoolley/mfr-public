'use client'

// Content-admin panel to manage the rotating photo slides per collection
// (each reunion year + "Highlights"): upload, reorder, remove. Wraps the
// server actions in ./actions.ts with busy/error state.

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { uploadSlides, removeSlide, reorderSlides } from './actions'
import { SLIDE_CAP, type ActionResult } from './constants'

export interface EditorSlide {
  id: string
  blobUrl: string
}
export interface SlideCollectionOption {
  value: string // "highlights" or a 4-digit year
  label: string
}

export function SlidesEditor({
  collections,
  slidesByCollection,
}: {
  collections: SlideCollectionOption[]
  slidesByCollection: Record<string, EditorSlide[]>
}) {
  const [selected, setSelected] = useState(collections[0]?.value ?? 'highlights')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const slides = slidesByCollection[selected] ?? []

  function run(fn: () => Promise<ActionResult>) {
    setError(null)
    start(async () => {
      const result = await fn()
      if ('error' in result) setError(result.error)
    })
  }

  function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    run(() => uploadSlides(selected, list))
    if (fileInput.current) fileInput.current.value = ''
  }

  function move(index: number, delta: number) {
    const next = [...slides]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    run(() =>
      reorderSlides(
        selected,
        next.map((s) => s.id),
      ),
    )
  }

  return (
    <div className="card elev-sm bg-white" style={{ padding: '24px 24px 22px' }}>
      <h2 className="m-0 text-[22px]">Rotating photos</h2>
      <p
        className="mt-2"
        style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}
      >
        Upload a few photos for the home page (Highlights) and for each year&rsquo;s album card —
        the pages slowly rotate through them. Up to {SLIDE_CAP} per collection. The full album still
        lives in Google&nbsp;Photos.
      </p>

      <div className="mt-4.5 flex items-center gap-2.5">
        <label htmlFor="slides-collection" style={{ fontWeight: 700, fontSize: 14 }}>
          Collection
        </label>
        <select
          id="slides-collection"
          className="input"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {collections.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {slides.map((s, i) => (
          <div key={s.id} className="relative" style={{ width: 96 }}>
            <div
              className="relative overflow-hidden"
              style={{
                width: 96,
                height: 72,
                borderRadius: 8,
                background: 'var(--color-neutral-200)',
              }}
            >
              <Image src={s.blobUrl} alt="Slide" fill sizes="96px" style={{ objectFit: 'cover' }} />
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-icon"
                  title="Move earlier"
                  disabled={pending || i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  title="Move later"
                  disabled={pending || i === slides.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
              </span>
              <button
                type="button"
                className="btn btn-icon"
                title="Remove photo"
                disabled={pending}
                onClick={() => run(() => removeSlide(s.id))}
                style={{ color: 'var(--color-accent-700)' }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        {slides.length === 0 && (
          <span style={{ fontSize: 13.5, color: 'var(--color-neutral-600)' }}>
            No photos yet — this collection shows its static placeholder.
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          disabled={pending || slides.length >= SLIDE_CAP}
          onChange={(e) => onFilesChosen(e.target.files)}
        />
        {pending && (
          <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Working…</span>
        )}
      </div>
      {slides.length >= SLIDE_CAP && (
        <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
          This collection is full ({SLIDE_CAP}). Remove a photo to add another.
        </span>
      )}
      {error && (
        <span className="mt-2 block" style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
