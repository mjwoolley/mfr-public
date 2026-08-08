// Unit: the authorization gate on the sharp diagnostic, and that it stays a
// *report* (200) rather than a health gate (503) even when the probes fail.
// buildImageReport is mocked — its own behaviour is covered in
// lib/photos/imageDiagnostics.test.ts.

import { afterEach, describe, it, expect, vi } from 'vitest'

// Only buildImageReport is stubbed. parseCpuFlags stays real, so the route's
// readCpuFlags wiring is exercised for what it is rather than against a stub.
const buildImageReport = vi.fn()
vi.mock('@/lib/photos/imageDiagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photos/imageDiagnostics')>()),
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

  // The route's whole job is assembling these probes correctly, so the test
  // EXECUTES each one rather than just checking it was handed over. A closure
  // that is passed along but never called is exactly the kind of wiring bug
  // that only shows up in production.
  it('wires real runtime probes through to buildImageReport', async () => {
    process.env.CRON_SECRET = 's3cret'
    buildImageReport.mockResolvedValue({})
    await GET(req({ authorization: 'Bearer s3cret' }))
    const deps = buildImageReport.mock.calls[0][0]
    expect(deps.platform).toBe(process.platform)
    expect(deps.arch).toBe(process.arch)
    expect(deps.nodeVersion).toBe(process.version)

    // Loads the real sharp module and hands back the callable, not the ESM
    // namespace object (sharp is CommonJS — the callable is on `default`).
    await expect(deps.loadSharp()).resolves.toBeTypeOf('function')

    // glibc is reported on Linux and simply absent elsewhere; either way it
    // must not throw, or the whole report would be lost to one probe.
    expect(() => deps.glibcVersion()).not.toThrow()

    // /proc/cpuinfo exists on the Linux CI runner and not on macOS. Both are
    // valid — a flags string, or a throw that probe() turns into a reported
    // error — but the closure must run.
    let flags: string | undefined
    try {
      flags = deps.readCpuFlags()
    } catch {
      flags = undefined
    }
    if (process.platform === 'linux') {
      expect(flags).toEqual(expect.stringContaining('fpu'))
    } else {
      expect(flags).toBeUndefined()
    }
    // resolveModule must find a real dependency on disk and throw on a fake
    // one, so "present" in the report means what it says. This is a real fs
    // probe on purpose: a bundler rewrites `require.resolve` on a dynamic
    // specifier into an always-throwing stub, which would make every package
    // look missing. Catching that regression here is the whole point.
    const found = deps.resolveModule('sharp') as { path: string; version?: string }
    expect(found.path).toContain('node_modules/sharp')
    expect(found.version).toMatch(/^\d+\./)
    expect(() => deps.resolveModule('@img/definitely-not-installed')).toThrow(/not found/)
  })
})
