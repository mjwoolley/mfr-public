'use client'

// Member upload control. The browser streams each original straight to Vercel
// Blob (client upload — bypasses the Server Action body limit for big photos),
// then calls finalizeUpload to normalize + record it. HEIC is allowed (iPhone
// default); the content type is inferred from the extension when the browser
// reports none, so it survives the token content-type check and server routing.

import { useRef, useState, useTransition } from 'react'
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

export function GalleryUploader({ year }: { year: number }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setError(null)
    start(async () => {
      let done = 0
      for (const file of list) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`${file.name} is larger than 25 MB.`)
          continue
        }
        setStatus(`Uploading ${done + 1} of ${list.length}…`)
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
          if ('error' in res) setError(res.error)
          else done += 1
        } catch (e) {
          setError((e as Error).message || 'Upload failed')
        }
      }
      setStatus(null)
      if (fileInput.current) fileInput.current.value = ''
      if (done > 0) router.refresh()
    })
  }

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
      {status && <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>{status}</span>}
      {error && <span style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>{error}</span>}
    </div>
  )
}
