'use client'

// The Documents file browser. Folders navigate in-page via ?folder=<id>; files
// are viewable inline (PDF/image/video) in a modal, or download-only for
// everything else. Every file — viewed or downloaded — goes through
// /api/documents/download, so the browser never talks to Google directly (site
// auth is the only gate). Viewability is decided by `viewerKind` on the served
// Content-Type, mirrored from the download route.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { DriveEntry } from '@/lib/drive/client'
import { finalContentType } from '@/lib/drive/mime'
import { viewerKind, type ViewerKind } from '@/lib/drive/viewable'

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const FolderIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </svg>
)

const FileIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
  </svg>
)

const CloseIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

const downloadHref = (id: string) => `/api/documents/download?id=${encodeURIComponent(id)}`
const viewHref = (id: string) => `${downloadHref(id)}&inline=1`

function EntryIcon({ isFolder }: { isFolder: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: isFolder ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)',
        color: isFolder ? 'var(--color-accent-2-700)' : 'var(--color-neutral-700)',
      }}
    >
      {isFolder ? <FolderIcon /> : <FileIcon />}
    </span>
  )
}

function EntryLabel({ name, meta }: { name: string; meta: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
        {name}
      </span>
      {meta && (
        <span className="block text-xs" style={{ color: 'var(--color-neutral-700)' }}>
          {meta}
        </span>
      )}
    </span>
  )
}

const ROW_CLASS = 'doc-row flex items-center gap-3.5 px-3.5 py-2.5'
const ROW_STYLE = { borderRadius: 12 } as const

function EntryRow({ entry, onView }: { entry: DriveEntry; onView: (e: DriveEntry) => void }) {
  const meta = [formatBytes(entry.size), formatDate(entry.modifiedTime)].filter(Boolean).join(' · ')

  if (entry.isFolder) {
    return (
      <Link href={`/documents?folder=${entry.id}`} className={ROW_CLASS} style={ROW_STYLE}>
        <EntryIcon isFolder />
        <EntryLabel name={entry.name} meta={meta} />
        <span className="shrink-0 text-xs" style={{ color: 'var(--color-neutral-700)' }}>
          Open
        </span>
      </Link>
    )
  }

  const kind = viewerKind(finalContentType(entry.mimeType))

  // Download-only file (no inline preview for this type).
  if (!kind) {
    return (
      <a href={downloadHref(entry.id)} className={ROW_CLASS} style={ROW_STYLE}>
        <EntryIcon isFolder={false} />
        <EntryLabel name={entry.name} meta={meta} />
        <span className="shrink-0 text-xs" style={{ color: 'var(--color-neutral-700)' }}>
          Download
        </span>
      </a>
    )
  }

  // Viewable file: the main area opens the in-site viewer; View · Download sit on
  // the right as explicit actions.
  return (
    <div className={ROW_CLASS} style={ROW_STYLE}>
      <button
        type="button"
        onClick={() => onView(entry)}
        aria-label={`View ${entry.name}`}
        className="flex min-w-0 flex-1 items-center gap-3.5 bg-transparent p-0 text-left"
        style={{ border: 'none', cursor: 'pointer', color: 'inherit' }}
      >
        <EntryIcon isFolder={false} />
        <EntryLabel name={entry.name} meta={meta} />
      </button>
      <span className="flex shrink-0 items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => onView(entry)}
          className="bg-transparent p-0"
          style={{
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-accent-700)',
            fontWeight: 700,
          }}
        >
          View
        </button>
        <a href={downloadHref(entry.id)} style={{ color: 'var(--color-neutral-700)' }}>
          Download
        </a>
      </span>
    </div>
  )
}

function ViewerBody({ kind, entry }: { kind: ViewerKind; entry: DriveEntry }) {
  const [errored, setErrored] = useState(false)
  const src = viewHref(entry.id)

  if (errored) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 text-center"
        style={{ minHeight: '40vh' }}
      >
        <p style={{ fontSize: 15, color: 'var(--color-neutral-700)' }}>
          This file couldn&rsquo;t be previewed.
        </p>
        <a href={downloadHref(entry.id)} className="btn btn-primary">
          Download instead
        </a>
      </div>
    )
  }

  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={entry.name}
        onError={() => setErrored(true)}
        style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', margin: '0 auto' }}
      />
    )
  }

  if (kind === 'video') {
    return (
      <video
        src={src}
        controls
        onError={() => setErrored(true)}
        style={{ width: '100%', maxHeight: '80vh', background: '#000', borderRadius: 8 }}
      />
    )
  }

  // pdf (and text/plain) — the browser's native viewer inside a sandboxed frame.
  return (
    <iframe
      src={src}
      title={entry.name}
      onError={() => setErrored(true)}
      style={{ width: '100%', height: '78vh', border: 'none', borderRadius: 8 }}
    />
  )
}

function ViewerModal({ entry, onClose }: { entry: DriveEntry; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const kind = viewerKind(finalContentType(entry.mimeType)) as ViewerKind

  // Lock body scroll, close on Escape, move focus into the dialog, and restore
  // focus to the trigger on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(46,43,37,.62)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card bg-white flex w-full flex-col"
        style={{ padding: 14, maxWidth: 'min(1100px, 96vw)', maxHeight: '96vh' }}
      >
        <div className="mb-3 flex items-center gap-3">
          <span
            className="min-w-0 flex-1 truncate"
            style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}
            title={entry.name}
          >
            {entry.name}
          </span>
          <a
            href={viewHref(entry.id)}
            target="_blank"
            rel="noopener"
            className="btn btn-secondary"
            style={{ fontWeight: 700 }}
          >
            Open in new tab
          </a>
          <a
            href={downloadHref(entry.id)}
            className="btn btn-secondary"
            style={{ fontWeight: 700 }}
          >
            Download
          </a>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <ViewerBody kind={kind} entry={entry} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DocumentsBrowser({ entries }: { entries: DriveEntry[] }) {
  const [active, setActive] = useState<DriveEntry | null>(null)
  const onView = useCallback((e: DriveEntry) => setActive(e), [])
  const onClose = useCallback(() => setActive(null), [])

  return (
    <>
      <div className="flex flex-col">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} onView={onView} />
        ))}
      </div>
      {active && <ViewerModal entry={active} onClose={onClose} />}
    </>
  )
}
