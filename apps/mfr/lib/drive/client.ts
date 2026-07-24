// Google Drive read access for the Documents page. This is deliberately NOT the
// heavy `googleapis` SDK — we mint a service-account access token with
// `google-auth-library` and call the Drive REST v3 API with `fetch`. The site
// reads the shared folder on every member's behalf; members are never invited to
// the Drive themselves. Site auth (requireApproved) is the only gate, and
// `assertWithinRoot` is the boundary that stops a crafted id from reaching
// anything outside the configured root folder.

import { GoogleAuth } from 'google-auth-library'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** A folder id is a long (25+) base64url-ish token; this pulls it out of any
 * pasted folder URL shape (`/folders/<id>` or `/folders/<id>?usp=sharing`). */
export function extractDriveFolderId(url: string): string {
  return url.trim().match(/[-\w]{25,}/)?.[0] ?? ''
}

export interface DriveEntry {
  id: string
  name: string
  mimeType: string
  isFolder: boolean
  /** Bytes for binary files; null for folders and Google-native docs. */
  size: number | null
  modifiedTime: string | null
}

export interface FileMeta {
  id: string
  name: string
  mimeType: string
  size: number | null
  parents: string[]
}

export interface FileDownload {
  /** Raw response body to stream back to the client. */
  body: ReadableStream<Uint8Array> | null
  contentType: string
  /** Known byte length for binary files; null for exported Google docs. */
  contentLength: number | null
  /** Extension to append to the filename for exported Google docs (e.g. '.pdf'). */
  exportExtension: string
}

export class DriveApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Drive API ${status}: ${message}`)
    this.name = 'DriveApiError'
  }
}

export class DriveNotWithinRootError extends Error {
  constructor(id: string) {
    super(`File ${id} is not within the configured Drive root folder`)
    this.name = 'DriveNotWithinRootError'
  }
}

// Google-native docs cannot be downloaded raw (`alt=media`); they must be
// exported to a real format.
const GOOGLE_EXPORT: Record<string, { mimeType: string; ext: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.drawing': { mimeType: 'image/png', ext: '.png' },
}
const DEFAULT_EXPORT = { mimeType: 'application/pdf', ext: '.pdf' }

const isGoogleNative = (mimeType: string) =>
  mimeType.startsWith('application/vnd.google-apps.') && mimeType !== FOLDER_MIME

// ── TTL cache ─────────────────────────────────────────────────────────────────
// Per-instance, keyed by id. Serverless instances share it across requests; a
// short TTL keeps the folder view fresh without hammering the Drive API.
function makeCache<T>(ttlMs: number, now: () => number) {
  const store = new Map<string, { value: T; expires: number }>()
  return {
    get(key: string): T | undefined {
      const hit = store.get(key)
      if (!hit) return undefined
      if (hit.expires <= now()) {
        store.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key: string, value: T) {
      store.set(key, { value, expires: now() + ttlMs })
    },
  }
}

export interface CreateDriveClientOptions {
  getToken: () => Promise<string>
  fetchImpl?: typeof fetch
  now?: () => number
  ttlMs?: number
}

export interface Crumb {
  id: string
  name: string
}

export interface DriveClient {
  listFolder(folderId: string): Promise<DriveEntry[]>
  getFileMeta(fileId: string): Promise<FileMeta>
  fetchFileContent(fileId: string, mimeType: string): Promise<FileDownload>
  assertWithinRoot(id: string, rootId: string): Promise<void>
  /** Breadcrumb from the root folder down to `folderId` (inclusive of both). */
  getFolderPath(folderId: string, rootId: string): Promise<Crumb[]>
}

export function createDriveClient(opts: CreateDriveClientOptions): DriveClient {
  const doFetch = opts.fetchImpl ?? fetch
  const now = opts.now ?? (() => Date.now())
  const ttlMs = opts.ttlMs ?? 60_000
  const listCache = makeCache<DriveEntry[]>(ttlMs, now)
  const metaCache = makeCache<FileMeta | null>(ttlMs, now)

  async function driveFetch(path: string): Promise<Response> {
    const token = await opts.getToken()
    const res = await doFetch(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new DriveApiError(res.status, await res.text())
    return res
  }

  async function listFolder(folderId: string): Promise<DriveEntry[]> {
    const cached = listCache.get(folderId)
    if (cached) return cached

    const entries: DriveEntry[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await driveFetch(`/files?${params.toString()}`)
      const json = (await res.json()) as {
        nextPageToken?: string
        files?: Array<{
          id: string
          name: string
          mimeType: string
          size?: string
          modifiedTime?: string
        }>
      }
      for (const f of json.files ?? []) {
        const isFolder = f.mimeType === FOLDER_MIME
        entries.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          isFolder,
          size: !isFolder && f.size != null ? Number(f.size) : null,
          modifiedTime: f.modifiedTime ?? null,
        })
      }
      pageToken = json.nextPageToken
    } while (pageToken)

    // Folders first, then case-insensitive by name.
    entries.sort(
      (a, b) =>
        Number(b.isFolder) - Number(a.isFolder) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
    listCache.set(folderId, entries)
    return entries
  }

  /** Metadata lookup that returns null on 404 (used by the parent-chain walk). */
  async function tryGetMeta(fileId: string): Promise<FileMeta | null> {
    const cached = metaCache.get(fileId)
    if (cached !== undefined) return cached
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,size,parents',
      supportsAllDrives: 'true',
    })
    let meta: FileMeta | null
    try {
      const res = await driveFetch(`/files/${fileId}?${params.toString()}`)
      const f = (await res.json()) as {
        id: string
        name: string
        mimeType: string
        size?: string
        parents?: string[]
      }
      meta = {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size != null ? Number(f.size) : null,
        parents: f.parents ?? [],
      }
    } catch (err) {
      if (err instanceof DriveApiError && err.status === 404) meta = null
      else throw err
    }
    metaCache.set(fileId, meta)
    return meta
  }

  async function getFileMeta(fileId: string): Promise<FileMeta> {
    const meta = await tryGetMeta(fileId)
    if (!meta) throw new DriveApiError(404, `File ${fileId} not found`)
    return meta
  }

  // Walk parents upward until we hit the root. Multi-parent and cycle safe.
  async function assertWithinRoot(id: string, rootId: string): Promise<void> {
    if (id === rootId) return
    const seen = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const current = stack.pop() as string
      if (seen.has(current)) continue
      seen.add(current)
      const meta = await tryGetMeta(current)
      if (!meta) continue // broken/inaccessible link — cannot prove containment
      for (const parent of meta.parents) {
        if (parent === rootId) return
        if (!seen.has(parent)) stack.push(parent)
      }
    }
    throw new DriveNotWithinRootError(id)
  }

  async function fetchFileContent(fileId: string, mimeType: string): Promise<FileDownload> {
    if (isGoogleNative(mimeType)) {
      const target = GOOGLE_EXPORT[mimeType] ?? DEFAULT_EXPORT
      const params = new URLSearchParams({ mimeType: target.mimeType, supportsAllDrives: 'true' })
      const res = await driveFetch(`/files/${fileId}/export?${params.toString()}`)
      return {
        body: res.body,
        contentType: target.mimeType,
        contentLength: null,
        exportExtension: target.ext,
      }
    }
    const params = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' })
    const res = await driveFetch(`/files/${fileId}?${params.toString()}`)
    const len = res.headers?.get('content-length')
    return {
      body: res.body,
      contentType: mimeType,
      contentLength: len ? Number(len) : null,
      exportExtension: '',
    }
  }

  async function getFolderPath(folderId: string, rootId: string): Promise<Crumb[]> {
    const rootMeta = await tryGetMeta(rootId)
    const root: Crumb = { id: rootId, name: rootMeta?.name || 'Documents' }
    if (folderId === rootId) return [root]

    const chain: Crumb[] = []
    const seen = new Set<string>()
    let current: string | undefined = folderId
    while (current && current !== rootId && !seen.has(current)) {
      seen.add(current)
      const meta = await tryGetMeta(current)
      if (!meta) break
      chain.unshift({ id: current, name: meta.name })
      // Prefer the root as the next hop if it's a direct parent; otherwise
      // follow the first parent up the tree.
      current = meta.parents.find((p) => p === rootId) ?? meta.parents[0]
    }
    return [root, ...chain]
  }

  return { listFolder, getFileMeta, fetchFileContent, assertWithinRoot, getFolderPath }
}

// ── Default env-backed singleton ──────────────────────────────────────────────

/** Accepts either the raw service-account JSON or its base64 encoding. */
export function parseServiceAccountKey(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  const json = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8')
  return JSON.parse(json) as Record<string, unknown>
}

/** A token getter backed by GOOGLE_DRIVE_SA_KEY. The GoogleAuth instance is
 * built lazily and reused for the life of the returned closure. */
export function createEnvGetToken(): () => Promise<string> {
  let auth: GoogleAuth | null = null
  return async () => {
    const raw = process.env.GOOGLE_DRIVE_SA_KEY
    if (!raw) throw new Error('GOOGLE_DRIVE_SA_KEY is not set')
    auth ??= new GoogleAuth({ credentials: parseServiceAccountKey(raw), scopes: [DRIVE_SCOPE] })
    const token = await auth.getAccessToken()
    if (!token) throw new Error('Failed to obtain a Google Drive access token')
    return token
  }
}

let sharedClient: DriveClient | null = null
/** The process-wide client, reading credentials from GOOGLE_DRIVE_SA_KEY. Its
 * TTL cache persists across requests within a serverless instance. */
export function getDriveClient(): DriveClient {
  sharedClient ??= createDriveClient({ getToken: createEnvGetToken() })
  return sharedClient
}
