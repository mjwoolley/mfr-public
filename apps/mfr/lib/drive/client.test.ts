import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createDriveClient,
  createEnvGetToken,
  parseServiceAccountKey,
  getDriveClient,
  extractDriveFolderId,
  DriveNotWithinRootError,
  DriveApiError,
} from './client'

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }))
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getAccessToken = getAccessToken
  },
}))

// ── Fake Drive REST backend ──────────────────────────────────────────────────
// A tiny in-memory Drive: a `files` map (id → metadata incl. parents) and a
// `children` map (folderId → child ids). The fake `fetch` routes the three
// endpoint shapes the client uses: files.list, files.get (meta), files.get
// (alt=media) / files.export.

interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  size?: string
  modifiedTime?: string
  content?: string
}

function makeBackend(files: FakeFile[]) {
  const byId = new Map(files.map((f) => [f.id, f]))
  const calls: string[] = []

  const jsonResponse = (obj: unknown) => ({
    ok: true,
    status: 200,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
    body: null,
  })

  const fetchImpl = vi.fn(async (input: string | URL) => {
    const url = new URL(typeof input === 'string' ? input : input.toString())
    calls.push(url.pathname + url.search)
    const path = url.pathname

    // files.list — children of a folder
    if (path === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? ''
      const m = q.match(/'([^']+)' in parents/)
      const parentId = m?.[1] ?? ''
      const pageToken = url.searchParams.get('pageToken')
      const kids = files.filter((f) => f.parents?.includes(parentId))
      // Split into two pages to exercise pagination when >1 child exists.
      const half = Math.ceil(kids.length / 2)
      const page = pageToken === 'p2' ? kids.slice(half) : kids.slice(0, half)
      const nextPageToken = pageToken !== 'p2' && kids.length > half ? 'p2' : undefined
      return jsonResponse({
        nextPageToken,
        files: page.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          modifiedTime: f.modifiedTime,
        })),
      }) as unknown as Response
    }

    // files.export — Google-native document
    const exportMatch = path.match(/^\/drive\/v3\/files\/([^/]+)\/export$/)
    if (exportMatch) {
      const f = byId.get(exportMatch[1])
      return {
        ok: true,
        status: 200,
        body: `exported:${f?.id}` as unknown as ReadableStream,
        headers: new Headers({ 'content-type': url.searchParams.get('mimeType') ?? '' }),
      } as unknown as Response
    }

    // files.get — either metadata or media content
    const getMatch = path.match(/^\/drive\/v3\/files\/([^/]+)$/)
    if (getMatch) {
      const f = byId.get(getMatch[1])
      if (!f) {
        return {
          ok: false,
          status: 404,
          text: async () => 'File not found',
        } as unknown as Response
      }
      if (url.searchParams.get('alt') === 'media') {
        return {
          ok: true,
          status: 200,
          body: `bytes:${f.id}` as unknown as ReadableStream,
          headers: new Headers({
            'content-type': f.mimeType,
            'content-length': f.size ?? '',
          }),
        } as unknown as Response
      }
      return jsonResponse({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        parents: f.parents,
      }) as unknown as Response
    }

    throw new Error(`unexpected fetch: ${url.toString()}`)
  })

  return { fetchImpl, calls }
}

const ROOT = 'ROOT'
// root/ ─ Bylaws.pdf, Budgets(folder)/ ─ 2025.xlsx, notes(gdoc)
//        Outside tree: STRAY_FOLDER/ ─ secret.pdf
const GRAPH: FakeFile[] = [
  {
    id: ROOT,
    name: 'Family Documents',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['DRIVE_TOP'],
  },
  {
    id: 'folderBudgets',
    name: 'Budgets',
    mimeType: 'application/vnd.google-apps.folder',
    parents: [ROOT],
  },
  {
    id: 'fileBylaws',
    name: 'Bylaws.pdf',
    mimeType: 'application/pdf',
    parents: [ROOT],
    size: '2048',
    modifiedTime: '2026-01-02T00:00:00Z',
  },
  {
    id: 'file2025',
    name: '2025.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    parents: ['folderBudgets'],
    size: '512',
  },
  {
    id: 'gdocNotes',
    name: 'Meeting notes',
    mimeType: 'application/vnd.google-apps.document',
    parents: ['folderBudgets'],
  },
  { id: 'fileNoLen', name: 'notes.txt', mimeType: 'text/plain', parents: [ROOT] },
  // Not reachable from ROOT:
  {
    id: 'strayFolder',
    name: 'Stray',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['SOMEONE_ELSE'],
  },
  {
    id: 'secret',
    name: 'secret.pdf',
    mimeType: 'application/pdf',
    parents: ['strayFolder'],
    size: '99',
  },
]

function client(files: FakeFile[] = GRAPH, opts: { now?: () => number; ttlMs?: number } = {}) {
  const backend = makeBackend(files)
  let t = 0
  const drive = createDriveClient({
    getToken: async () => 'fake-token',
    fetchImpl: backend.fetchImpl as unknown as typeof fetch,
    now: opts.now ?? (() => t),
    ttlMs: opts.ttlMs ?? 60_000,
  })
  return { drive, backend, advance: (ms: number) => (t += ms) }
}

describe('extractDriveFolderId', () => {
  it('pulls the id out of any folder URL shape', () => {
    const id = '1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7'
    expect(extractDriveFolderId(`https://drive.google.com/drive/folders/${id}`)).toBe(id)
    expect(extractDriveFolderId(`https://drive.google.com/drive/folders/${id}?usp=sharing`)).toBe(
      id,
    )
    expect(extractDriveFolderId('   ')).toBe('')
    expect(extractDriveFolderId('not a drive url')).toBe('')
  })
})

describe('listFolder', () => {
  it('lists direct children, folders first then by name, mapping size/isFolder', async () => {
    const { drive } = client()
    const entries = await drive.listFolder(ROOT)
    // Folders first, then files case-insensitively by name.
    expect(entries.map((e) => e.name)).toEqual(['Budgets', 'Bylaws.pdf', 'notes.txt'])
    expect(entries[0]).toMatchObject({ id: 'folderBudgets', isFolder: true, size: null })
    expect(entries[1]).toMatchObject({ id: 'fileBylaws', isFolder: false, size: 2048 })
  })

  it('follows pagination to gather every child', async () => {
    const { drive } = client()
    const entries = await drive.listFolder('folderBudgets')
    // Two children served across two pages (p1 + p2).
    expect(entries.map((e) => e.name).sort()).toEqual(['2025.xlsx', 'Meeting notes'])
  })

  it('serves the second call from cache within the TTL, then refetches after it', async () => {
    const { drive, backend, advance } = client(GRAPH, { ttlMs: 1000 })
    await drive.listFolder(ROOT)
    await drive.listFolder(ROOT)
    const listCalls = () => backend.calls.filter((c) => c.startsWith('/drive/v3/files?')).length
    const after2 = listCalls()
    advance(2000)
    await drive.listFolder(ROOT)
    expect(listCalls()).toBeGreaterThan(after2)
  })

  it('throws DriveApiError when Drive responds non-ok', async () => {
    const backend = makeBackend([])
    backend.fetchImpl.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'insufficient permissions',
    } as unknown as Response)
    const drive = createDriveClient({
      getToken: async () => 't',
      fetchImpl: backend.fetchImpl as unknown as typeof fetch,
    })
    await expect(drive.listFolder(ROOT)).rejects.toBeInstanceOf(DriveApiError)
  })
})

describe('assertWithinRoot (security boundary)', () => {
  it('accepts the root itself without any lookup', async () => {
    const { drive, backend } = client()
    await expect(drive.assertWithinRoot(ROOT, ROOT)).resolves.toBeUndefined()
    expect(backend.calls).toHaveLength(0)
  })

  it('accepts a file nested several levels under the root', async () => {
    const { drive } = client()
    await expect(drive.assertWithinRoot('file2025', ROOT)).resolves.toBeUndefined()
    await expect(drive.assertWithinRoot('gdocNotes', ROOT)).resolves.toBeUndefined()
  })

  it('REJECTS an id whose parent chain never reaches the root', async () => {
    const { drive } = client()
    await expect(drive.assertWithinRoot('secret', ROOT)).rejects.toBeInstanceOf(
      DriveNotWithinRootError,
    )
  })

  it('REJECTS an id that does not exist at all', async () => {
    const { drive } = client()
    await expect(drive.assertWithinRoot('nope', ROOT)).rejects.toBeInstanceOf(
      DriveNotWithinRootError,
    )
  })
})

describe('getFolderPath (breadcrumb)', () => {
  it('returns just the root when the current folder is the root', async () => {
    const { drive } = client()
    const path = await drive.getFolderPath(ROOT, ROOT)
    expect(path).toEqual([{ id: ROOT, name: 'Family Documents' }])
  })

  it('builds the trail from root down to a nested folder', async () => {
    const { drive } = client()
    const path = await drive.getFolderPath('folderBudgets', ROOT)
    expect(path).toEqual([
      { id: ROOT, name: 'Family Documents' },
      { id: 'folderBudgets', name: 'Budgets' },
    ])
  })
})

describe('fetchFileContent', () => {
  it('streams a binary file via alt=media with its own content type', async () => {
    const { drive } = client()
    const dl = await drive.fetchFileContent('fileBylaws', 'application/pdf')
    expect(dl.contentType).toBe('application/pdf')
    expect(dl.contentLength).toBe(2048)
    expect(dl.exportExtension).toBe('')
    expect(dl.body).toBe('bytes:fileBylaws')
  })

  it('exports a Google Doc to PDF', async () => {
    const { drive } = client()
    const dl = await drive.fetchFileContent('gdocNotes', 'application/vnd.google-apps.document')
    expect(dl.contentType).toBe('application/pdf')
    expect(dl.exportExtension).toBe('.pdf')
    expect(dl.contentLength).toBeNull()
    expect(dl.body).toBe('exported:gdocNotes')
  })

  it('exports a Google Sheet to xlsx', async () => {
    const { drive } = client()
    const dl = await drive.fetchFileContent('x', 'application/vnd.google-apps.spreadsheet')
    expect(dl.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(dl.exportExtension).toBe('.xlsx')
  })

  it('falls back to PDF export for an unmapped Google-native type', async () => {
    const { drive } = client()
    const dl = await drive.fetchFileContent('x', 'application/vnd.google-apps.form')
    expect(dl.contentType).toBe('application/pdf')
    expect(dl.exportExtension).toBe('.pdf')
  })

  it('reports null contentLength for a binary file with no length header', async () => {
    const { drive } = client()
    const dl = await drive.fetchFileContent('fileNoLen', 'text/plain')
    expect(dl.contentLength).toBeNull()
    expect(dl.contentType).toBe('text/plain')
  })
})

describe('getFileMeta', () => {
  it('returns metadata for an existing file', async () => {
    const { drive } = client()
    const meta = await drive.getFileMeta('fileBylaws')
    expect(meta).toMatchObject({ id: 'fileBylaws', name: 'Bylaws.pdf', size: 2048 })
  })

  it('throws DriveApiError(404) for a missing file', async () => {
    const { drive } = client()
    await expect(drive.getFileMeta('ghost')).rejects.toBeInstanceOf(DriveApiError)
  })

  it('propagates a non-404 Drive error while walking the parent chain', async () => {
    const backend = makeBackend([])
    backend.fetchImpl.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    } as unknown as Response)
    const drive = createDriveClient({
      getToken: async () => 't',
      fetchImpl: backend.fetchImpl as unknown as typeof fetch,
    })
    await expect(drive.assertWithinRoot('whatever', ROOT)).rejects.toBeInstanceOf(DriveApiError)
  })
})

describe('getFolderPath fallback', () => {
  it('labels the root "Documents" when its metadata is unavailable', async () => {
    const { drive } = client()
    const path = await drive.getFolderPath('NO_META', 'NO_META')
    expect(path).toEqual([{ id: 'NO_META', name: 'Documents' }])
  })
})

describe('service-account credentials + env token', () => {
  const ORIGINAL = process.env.GOOGLE_DRIVE_SA_KEY
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.GOOGLE_DRIVE_SA_KEY
    else process.env.GOOGLE_DRIVE_SA_KEY = ORIGINAL
    getAccessToken.mockReset()
    vi.unstubAllGlobals()
  })

  it('parses a raw JSON key and a base64-encoded key', () => {
    const key = { client_email: 'a@b', private_key: 'k' }
    const json = JSON.stringify(key)
    expect(parseServiceAccountKey(json)).toEqual(key)
    expect(parseServiceAccountKey(Buffer.from(json).toString('base64'))).toEqual(key)
  })

  it('throws on an unparseable key', () => {
    expect(() => parseServiceAccountKey('%%%not-json%%%')).toThrow()
  })

  it('throws when GOOGLE_DRIVE_SA_KEY is unset', async () => {
    delete process.env.GOOGLE_DRIVE_SA_KEY
    const getToken = createEnvGetToken()
    await expect(getToken()).rejects.toThrow('GOOGLE_DRIVE_SA_KEY is not set')
  })

  it('mints an access token from the configured key', async () => {
    process.env.GOOGLE_DRIVE_SA_KEY = JSON.stringify({ client_email: 'a@b', private_key: 'k' })
    getAccessToken.mockResolvedValue('minted-token')
    const getToken = createEnvGetToken()
    expect(await getToken()).toBe('minted-token')
  })

  it('throws when Google returns no token', async () => {
    process.env.GOOGLE_DRIVE_SA_KEY = JSON.stringify({ client_email: 'a@b', private_key: 'k' })
    getAccessToken.mockResolvedValue(null)
    const getToken = createEnvGetToken()
    await expect(getToken()).rejects.toThrow('Failed to obtain')
  })

  it('getDriveClient builds an env-backed client that authorizes Drive calls', async () => {
    process.env.GOOGLE_DRIVE_SA_KEY = JSON.stringify({ client_email: 'a@b', private_key: 'k' })
    getAccessToken.mockResolvedValue('tok')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ files: [] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const drive = getDriveClient()
    await drive.listFolder('SOMEFOLDER')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/files?'), {
      headers: { Authorization: 'Bearer tok' },
    })
  })
})
