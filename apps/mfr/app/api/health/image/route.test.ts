// Unit: the authorization gate on the sharp diagnostic, and that it stays a
// *report* (200) rather than a health gate (503) even when the probes fail.
// buildImageReport is mocked — its own behaviour is covered in
// lib/photos/imageDiagnostics.test.ts.

import { afterEach, describe, it, expect, vi } from 'vitest'

const buildImageReport = vi.fn()
vi.mock('@/lib/photos/imageDiagnostics', () => ({
  buildImageReport: (...a: unknown[]) => buildImageReport(...a),
}))

import { GET } from './route'

const req = (headers: Record<string, string> = {}) =>
  new Request('https://x/api/health/image', { headers })

afterEach(() => {
  buildImageReport.mockReset()
  delete process.env.CRON_SECRET
})

describe('GET /api/health/image', () => {
  it('401s without the bearer token', async () => {
    process.env.CRON_SECRET = 's3cret'
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(buildImageReport).not.toHaveBeenCalled()
  })

  it('401s on a wrong bearer token', async () => {
    process.env.CRON_SECRET = 's3cret'
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(buildImageReport).not.toHaveBeenCalled()
  })

  // Fail closed: an unset secret must not leave the diagnostic wide open.
  it('401s when CRON_SECRET is unset', async () => {
    const res = await GET(req({ authorization: 'Bearer ' }))
    expect(res.status).toBe(401)
    expect(buildImageReport).not.toHaveBeenCalled()
  })

  it('returns the report to an authorized caller', async () => {
    process.env.CRON_SECRET = 's3cret'
    buildImageReport.mockResolvedValue({ sharp: { loaded: true } })
    const res = await GET(req({ authorization: 'Bearer s3cret' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, report: { sharp: { loaded: true } } })
  })

  it('still returns 200 when every probe inside failed — it is a report, not a gate', async () => {
    process.env.CRON_SECRET = 's3cret'
    buildImageReport.mockResolvedValue({ sharp: { loaded: false, loadError: 'nope' } })
    const res = await GET(req({ authorization: 'Bearer s3cret' }))
    expect(res.status).toBe(200)
  })

  it('wires real runtime probes through to buildImageReport', async () => {
    process.env.CRON_SECRET = 's3cret'
    buildImageReport.mockResolvedValue({})
    await GET(req({ authorization: 'Bearer s3cret' }))
    const deps = buildImageReport.mock.calls[0][0]
    expect(deps.platform).toBe(process.platform)
    expect(deps.arch).toBe(process.arch)
    expect(deps.nodeVersion).toBe(process.version)
    // resolveModule must resolve a real dependency and throw on a fake one, so
    // "present on disk" in the report means what it says.
    expect(deps.resolveModule('sharp')).toContain('sharp')
    expect(() => deps.resolveModule('@img/definitely-not-installed')).toThrow()
  })
})
