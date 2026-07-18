// Thin wrapper over Vercel Blob for photo-slide images. Kept separate (and
// mocked in tests) so the admin server actions never import the SDK directly —
// makes the actions unit/integration-testable without a BLOB_READ_WRITE_TOKEN
// or network access.

import { put, del } from '@vercel/blob'

/** Upload one image to Blob under a unique public path. */
export async function putSlideImage(file: File): Promise<{ url: string; pathname: string }> {
  const pathname = `photo-slides/${crypto.randomUUID()}-${file.name}`
  const blob = await put(pathname, file, { access: 'public' })
  return { url: blob.url, pathname: blob.pathname }
}

/** Delete a previously-uploaded slide image by its Blob URL. */
export async function deleteSlideImage(url: string): Promise<void> {
  await del(url)
}
