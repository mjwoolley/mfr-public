// Requirements coverage for CAP-012 "Recent changes in Drive appear within a
// minute": the production cache lifetime (no ttlMs override) must let a newly
// added file show up once a minute has passed.
import { describe, expect, it, vi } from 'vitest'
import { createDriveClient } from './client'

function driveWith(files: () => Array<{ id: string; name: string; mimeType: string }>) {
  let t = 0
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ files: files() }),
    text: async () => '',
  }))
  const drive = createDriveClient({
    getToken: async () => 'token',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => t,
    // No ttlMs: exercise the production default.
  })
  return { drive, fetchImpl, advance: (ms: number) => (t += ms) }
}

describe('CAP-012 Family documents — Drive freshness', () => {
  it('CAP-012 · Recent changes in Drive appear within a minute', async () => {
    const folder = [{ id: 'a', name: 'Bylaws.pdf', mimeType: 'application/pdf' }]
    const { drive, advance } = driveWith(() => folder)

    expect((await drive.listFolder('ROOT')).map((e) => e.name)).toEqual(['Bylaws.pdf'])

    // A file is added in Drive.
    folder.push({ id: 'b', name: 'New minutes.pdf', mimeType: 'application/pdf' })

    // One minute after it was added, the new file is shown (the listing
    // may be cached before then, which the requirement allows).
    advance(60_000)
    expect((await drive.listFolder('ROOT')).map((e) => e.name)).toEqual([
      'Bylaws.pdf',
      'New minutes.pdf',
    ])
  })
})
