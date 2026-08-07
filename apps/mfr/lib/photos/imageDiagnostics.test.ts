// Unit: the sharp-loader diagnostic report. Every dependency is injected, so
// these tests can stage the two failure shapes we actually care about telling
// apart in production — "the native package isn't there" vs "it's there but the
// WASM fallback ran anyway" — without needing either runtime.

import { describe, it, expect } from 'vitest'
import {
  buildImageReport,
  candidatePackages,
  encodeProbe,
  missingX64V2Flags,
  probe,
  X64_V2_FLAGS,
  type ImageDiagnosticsDeps,
} from './imageDiagnostics'

const V2_FLAGS_LINE = `fpu vme de pse tsc ${X64_V2_FLAGS.join(' ')} avx2`

/** A sharp stand-in whose toBuffer returns bytes on the requested backing. */
function fakeSharp({ shared = false, versions = { vips: '8.17.0' }, x64v2 = true } = {}) {
  const make = () => {
    const bytes = new Uint8Array(shared ? new SharedArrayBuffer(12) : new ArrayBuffer(12))
    return Buffer.from(bytes.buffer as ArrayBuffer, 0, 12)
  }
  const fn = () => ({ jpeg: () => ({ toBuffer: async () => make() }) })
  return Object.assign(fn, { versions, _isUsingX64V2: () => x64v2 })
}

function deps(over: Partial<ImageDiagnosticsDeps> = {}): ImageDiagnosticsDeps {
  return {
    loadSharp: async () => fakeSharp(),
    resolveModule: (id) => `/var/task/node_modules/${id}/index.js`,
    readCpuFlags: () => V2_FLAGS_LINE,
    platform: 'linux',
    arch: 'x64',
    nodeVersion: 'v22.0.0',
    glibcVersion: () => '2.36',
    ...over,
  }
}

describe('probe', () => {
  it('reports a value on success', async () => {
    expect(await probe(() => 42)).toEqual({ ok: true, value: 42 })
  })

  it('converts a throw into a reported error instead of propagating', async () => {
    expect(
      await probe(() => {
        throw new Error('boom')
      }),
    ).toEqual({ ok: false, error: 'boom' })
  })

  it('reports a non-Error throw', async () => {
    expect(
      await probe(() => {
        throw 'plain string'
      }),
    ).toEqual({ ok: false, error: 'plain string' })
  })
})

describe('candidatePackages', () => {
  it('always covers the Linux x64 pair and the WASM fallback', () => {
    expect(candidatePackages('linux', 'x64')).toEqual([
      '@img/sharp-linux-x64',
      '@img/sharp-libvips-linux-x64',
      '@img/sharp-wasm32',
    ])
  })

  it('adds the host binary so the report is useful on a dev machine too', () => {
    expect(candidatePackages('darwin', 'arm64')[0]).toBe('@img/sharp-darwin-arm64')
    expect(candidatePackages('darwin', 'arm64')).toContain('@img/sharp-linux-x64')
  })
})

describe('missingX64V2Flags', () => {
  it('is empty when the CPU meets the x86-64-v2 baseline', () => {
    expect(missingX64V2Flags(V2_FLAGS_LINE)).toEqual([])
  })

  it('names the missing features — the tell for the _isUsingX64V2 gate', () => {
    expect(missingX64V2Flags('fpu vme de pse tsc popcnt sse3')).toEqual([
      'ssse3',
      'sse4_1',
      'sse4_2',
      'cx16',
    ])
  })

  it('is undefined when the flags could not be read at all (non-Linux)', () => {
    expect(missingX64V2Flags(undefined)).toBeUndefined()
  })
})

describe('encodeProbe', () => {
  it('reports the native verdict for heap-backed bytes', async () => {
    const r = await encodeProbe(fakeSharp({ shared: false }))
    expect(r.ok).toBe(true)
    expect(r.value).toMatchObject({
      sharedArrayBufferBacked: false,
      verdict: 'native binary in use',
    })
  })

  it('flags SharedArrayBuffer-backed bytes as the WASM fallback', async () => {
    const r = await encodeProbe(fakeSharp({ shared: true }))
    expect(r.value).toMatchObject({
      sharedArrayBufferBacked: true,
      verdict: 'wasm fallback in use',
    })
  })

  it('reports an encode failure rather than throwing', async () => {
    const broken = () => ({
      jpeg: () => ({
        toBuffer: async () => {
          throw new Error('vips error')
        },
      }),
    })
    expect(await encodeProbe(broken)).toEqual({ ok: false, error: 'vips error' })
  })
})

describe('buildImageReport', () => {
  it('reports a healthy native runtime', async () => {
    const report = await buildImageReport(deps())
    expect(report.runtime).toEqual({
      platform: 'linux',
      arch: 'x64',
      node: 'v22.0.0',
      glibc: '2.36',
    })
    expect(report.sharp.loaded).toBe(true)
    expect(report.sharp.versions).toEqual({ ok: true, value: { vips: '8.17.0' } })
    expect(report.sharp.isUsingX64V2).toEqual({ ok: true, value: true })
    expect(report.sharp.encode?.value).toMatchObject({ verdict: 'native binary in use' })
    expect(report.packages['@img/sharp-linux-x64'].ok).toBe(true)
    expect(report.cpu.missingX64V2Flags).toEqual([])
  })

  // Diagnosis (a): the binary never made it into the deployed bundle.
  it('distinguishes a missing native package from a rejected one', async () => {
    const report = await buildImageReport(
      deps({
        resolveModule: (id) => {
          if (id === '@img/sharp-linux-x64') throw new Error(`Cannot find module '${id}'`)
          return `/var/task/node_modules/${id}/index.js`
        },
        loadSharp: async () => fakeSharp({ shared: true }),
      }),
    )
    expect(report.packages['@img/sharp-linux-x64']).toEqual({
      ok: false,
      error: "Cannot find module '@img/sharp-linux-x64'",
    })
    expect(report.packages['@img/sharp-wasm32'].ok).toBe(true)
    expect(report.sharp.encode?.value).toMatchObject({ verdict: 'wasm fallback in use' })
  })

  // Diagnosis (b): present on disk, but the CPU gate rejected it.
  it('shows a present-but-rejected binary alongside the failing CPU gate', async () => {
    const report = await buildImageReport(
      deps({
        readCpuFlags: () => 'fpu vme de pse tsc popcnt',
        loadSharp: async () => fakeSharp({ shared: true, x64v2: false }),
      }),
    )
    expect(report.packages['@img/sharp-linux-x64'].ok).toBe(true)
    expect(report.sharp.isUsingX64V2).toEqual({ ok: true, value: false })
    expect(report.cpu.missingX64V2Flags).toEqual(['sse3', 'ssse3', 'sse4_1', 'sse4_2', 'cx16'])
    expect(report.sharp.encode?.value).toMatchObject({ verdict: 'wasm fallback in use' })
  })

  it('reports a total sharp load failure without throwing', async () => {
    const report = await buildImageReport(
      deps({
        loadSharp: async () => {
          throw new Error('Could not load the "sharp" module using the linux-x64 runtime')
        },
      }),
    )
    expect(report.sharp.loaded).toBe(false)
    expect(report.sharp.loadError).toMatch(/Could not load the "sharp" module/)
    expect(report.sharp.encode).toBeUndefined()
    // The rest of the report must still be populated — that's the point of
    // probing each piece independently.
    expect(report.packages['@img/sharp-wasm32'].ok).toBe(true)
    expect(report.runtime.platform).toBe('linux')
  })

  it('records when _isUsingX64V2 is absent rather than pretending it passed', async () => {
    const bare = Object.assign(
      () => ({ jpeg: () => ({ toBuffer: async () => Buffer.alloc(4) }) }),
      {
        versions: {},
      },
    )
    const report = await buildImageReport(deps({ loadSharp: async () => bare }))
    expect(report.sharp.isUsingX64V2).toEqual({
      ok: true,
      value: 'not exposed by this sharp version',
    })
  })

  it('omits cpu and glibc fields entirely when unavailable (macOS dev machine)', async () => {
    const report = await buildImageReport(
      deps({
        platform: 'darwin',
        arch: 'arm64',
        readCpuFlags: () => {
          throw new Error('ENOENT: /proc/cpuinfo')
        },
        glibcVersion: () => undefined,
      }),
    )
    expect(report.cpu).toEqual({})
    expect(report.runtime).not.toHaveProperty('glibc')
  })
})
