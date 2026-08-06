'use client'

// Member upload control. The browser streams each original straight to Vercel
// Blob (client upload — bypasses the Server Action body limit for big photos),
// then calls finalizeUpload to normalize + record it. HEIC is allowed (iPhone
// default); the content type is inferred from the extension when the browser
// reports none, so it survives the token content-type check and server routing.

import { useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { finalizeUpload } from './actions'
import { MAX_UPLOAD_BYTES } from '@/lib/photos/constants'

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
}

function contentTypeFor(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TYPES[ext] ?? 'application/octet-stream'
}

/** One file that did not make it into the gallery, and why. */
type UploadFailure = { name: string; message: string }

/** Outcome of one "Add photos" batch, reported until the member dismisses it. */
type BatchResult = { added: number; total: number; failures: UploadFailure[] }

export function GalleryUploader({ year }: { year: number }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  // A batch can partly succeed. Every failure is kept (one slot per file) rather
  // than overwritten, so a photo that silently didn't upload can't be mistaken
  // for one that did — the panel below names each file and stays until dismissed.
  const [result, setResult] = useState<BatchResult | null>(null)

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setResult(null)
    // Set synchronously (before the transition) so the modal pops the instant the
    // picker closes — otherwise the first update is deprioritized inside start().
    setProgress({ current: 1, total: list.length })
    start(async () => {
      const failures: UploadFailure[] = []
      let added = 0
      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        setProgress({ current: i + 1, total: list.length })
        if (file.size > MAX_UPLOAD_BYTES) {
          failures.push({ name: file.name, message: 'Larger than 25 MB.' })
          continue
        }
        const contentType = contentTypeFor(file)
        try {
          const blob = await upload(`gallery-tmp/${file.name}`, file, {
            access: 'public',
            handleUploadUrl: '/api/photos/upload-token',
            contentType,
            clientPayload: JSON.stringify({ year }),
          })
          const res = await finalizeUpload({
            url: blob.url,
            year,
            filename: file.name,
            contentType,
          })
          if ('error' in res) failures.push({ name: file.name, message: res.error })
          else added += 1
        } catch (e) {
          failures.push({ name: file.name, message: (e as Error).message || 'Upload failed.' })
        }
      }
      setProgress(null)
      setResult({ added, total: list.length, failures })
      if (fileInput.current) fileInput.current.value = ''
      if (added > 0) router.refresh()
    })
  }

  const failed = result?.failures.length ?? 0

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="btn btn-primary" style={{ cursor: pending ? 'default' : 'pointer' }}>
        Add photos
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          disabled={pending}
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      {/* A batch that failed in whole or in part must say so per file and stay
          put — an upload that never landed used to read as success. */}
      {result && failed > 0 && (
        <div
          role="alert"
          className="card w-full"
          style={{
            padding: '14px 16px',
            borderLeft: '4px solid var(--color-accent-700)',
            fontSize: 13.5,
          }}
        >
          <div style={{ fontWeight: 700 }}>
            {result.added > 0
              ? `${result.added} of ${result.total} photos added — ${failed} couldn’t be added:`
              : failed === 1
                ? 'That photo couldn’t be added:'
                : `None of the ${result.total} photos could be added:`}
          </div>
          <ul className="mt-1.5 flex flex-col gap-1" style={{ paddingLeft: 18 }}>
            {result.failures.map((f, i) => (
              <li key={`${f.name}-${i}`} style={{ listStyle: 'disc' }}>
                <span style={{ fontWeight: 600 }}>{f.name}</span> — {f.message}
              </li>
            ))}
          </ul>
          <div className="mt-2" style={{ color: 'var(--color-neutral-600)' }}>
            Nothing was saved for the photos listed above. You can select them and try again.
          </div>
          <button
            type="button"
            className="mt-2.5 underline underline-offset-[3px]"
            style={{ color: 'var(--color-accent)', fontSize: 13 }}
            onClick={() => setResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {progress &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,.6)' }}
            role="alertdialog"
            aria-label="Adding photos"
            aria-live="polite"
          >
            <div
              className="card bg-white flex flex-col items-center gap-3 text-center"
              style={{ padding: '26px 32px', minWidth: 240, animation: 'popin .2s ease' }}
            >
              <div className="spinner" aria-hidden />
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Adding photos</div>
              <div style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>
                {progress.total > 1
                  ? `Uploading ${progress.current} of ${progress.total}…`
                  : 'Uploading your photo…'}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
