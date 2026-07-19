// Thin wrapper over Vercel Blob for gallery images. Kept separate (and mocked in
// tests) so the upload server actions never import the SDK directly — makes them
// unit/integration-testable without a BLOB_READ_WRITE_TOKEN or network access.

import { put, del } from '@vercel/blob'

/** Upload a processed gallery image (raw bytes) to a caller-chosen public path. */
export async function putGalleryImage(
  pathname: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  const blob = await put(pathname, bytes, { access: 'public', contentType })
  return { url: blob.url, pathname: blob.pathname }
}

/** Delete any Blob object by its URL (gallery photos, temp originals). */
export async function deleteBlobObject(url: string): Promise<void> {
  await del(url)
}

/** Fetch the raw bytes of a Blob object (the just-uploaded original). */
export async function fetchBlobBytes(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to fetch blob (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}
