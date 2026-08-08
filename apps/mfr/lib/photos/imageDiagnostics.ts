// Why sharp's native binary does or doesn't load, reported from inside the
// deployed runtime.
//
// Background: sharp 0.35.3 broke every gallery upload in production for two
// weeks. On Vercel it failed to load `@img/sharp-linux-x64` and *silently*
// retried `@img/sharp-wasm32`; the WASM build allocates a **shared** WebAssembly
// memory, so its Buffers are SharedArrayBuffer-backed and `fetch` rejects them
// ("ArrayBuffer: SharedArrayBuffer is not allowed"), which killed the Blob
// upload inside finalizeUpload. We reverted to 0.34.5 (which fails loudly
// instead), reopening GHSA-f88m-g3jw-g9cj — and we cannot close it again until
// we know *why* the native binary was rejected.
//
// Two candidate explanations need different fixes, and only a report from the
// real runtime tells them apart:
//   a. the package never made it into the deployed bundle (a tracing problem);
//   b. it is present but the loader rejects it — most likely sharp's
//      `_isUsingX64V2()` microarchitecture gate, or a glibc mismatch.
// So the report covers presence-on-disk, load errors, the x86-64-v2 CPU feature
// set, and glibc — plus a live encode that reports whether the returned Buffer
// is shared-backed, which is the exact production symptom `unshare()` in
// ./imageProcess.ts warns about.
//
// Nothing here throws: every probe reports its own failure, because a
// diagnostic that dies on the first surprise tells you nothing about the rest.

/** One probe's outcome. `error` is present iff `ok` is false. */
export type ProbeResult = { ok: boolean; value?: unknown; error?: string }

export type ImageDiagnosticsDeps = {
  /** Dynamic so a total load failure is reportable rather than fatal. */
  loadSharp: () => Promise<unknown>
  /** Locate a package, throwing if it isn't installed/traced into the bundle.
   *  Whatever it returns (path, version, …) is reported verbatim. */
  resolveModule: (id: string) => unknown
  /** The `flags` line from /proc/cpuinfo, or undefined off Linux. */
  readCpuFlags: () => string | undefined
  platform: string
  arch: string
  nodeVersion: string
  /** glibc version this process is linked against, when reported. */
  glibcVersion: () => string | undefined
}

// The x86-64-v2 baseline sharp's `_isUsingX64V2()` gate checks for. If any of
// these are missing on a Vercel CPU, that gate is the reason the native binary
// is skipped — and the fix is a sharp/loader concern, not a bundling one.
export const X64_V2_FLAGS = ['popcnt', 'sse3', 'ssse3', 'sse4_1', 'sse4_2', 'cx16'] as const

/** Run a probe, converting any throw into a reported error. */
export async function probe(fn: () => unknown): Promise<ProbeResult> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Which `@img/*` packages to look for. Always includes the Linux x64 pair (what
 * Vercel actually needs) and the WASM fallback, plus the host's own binary so
 * the report is meaningful when run locally on a developer machine too.
 */
export function candidatePackages(platform: string, arch: string): string[] {
  const host = `@img/sharp-${platform}-${arch}`
  const always = ['@img/sharp-linux-x64', '@img/sharp-libvips-linux-x64', '@img/sharp-wasm32']
  return always.includes(host) ? always : [host, ...always]
}

/**
 * Extract the `flags` line's values from /proc/cpuinfo contents. Lives here
 * rather than inline in the route so it's testable on any platform — on macOS
 * the read throws before any parsing would run, which would otherwise leave
 * this logic covered only by luck of the CI runner's OS.
 */
export function parseCpuFlags(cpuinfo: string): string | undefined {
  const line = cpuinfo.split('\n').find((l) => l.startsWith('flags'))
  return line?.split(':').slice(1).join(':').trim()
}

/**
 * Given a /proc/cpuinfo flags line, which x86-64-v2 features are missing?
 * `undefined` when we couldn't read the flags at all (non-Linux, or no access).
 */
export function missingX64V2Flags(flagsLine: string | undefined): string[] | undefined {
  if (!flagsLine) return undefined
  const present = new Set(flagsLine.trim().split(/\s+/))
  return X64_V2_FLAGS.filter((f) => !present.has(f))
}

/**
 * Encode an 8x8 image and report how the bytes came back. A
 * SharedArrayBuffer-backed result means the WASM fallback is live — the precise
 * condition that broke uploads, detected here without needing a real upload.
 */
export async function encodeProbe(sharpModule: unknown): Promise<ProbeResult> {
  return probe(async () => {
    const sharp = sharpModule as (opts: unknown) => {
      jpeg: () => { toBuffer: () => Promise<Buffer> }
    }
    const data = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer()
    const shared =
      typeof SharedArrayBuffer !== 'undefined' && data.buffer instanceof SharedArrayBuffer
    return {
      bytes: data.length,
      sharedArrayBufferBacked: shared,
      // The one-line answer. If this says "wasm", uploads are broken (or would
      // be, on a version without unshare()'s copy).
      verdict: shared ? 'wasm fallback in use' : 'native binary in use',
    }
  })
}

export type ImageDiagnosticsReport = {
  runtime: { platform: string; arch: string; node: string; glibc?: string }
  sharp: {
    loaded: boolean
    loadError?: string
    versions?: ProbeResult
    isUsingX64V2?: ProbeResult
    encode?: ProbeResult
  }
  packages: Record<string, ProbeResult>
  cpu: { flags?: string; missingX64V2Flags?: string[] }
}

/** Build the whole report. Never throws. */
export async function buildImageReport(
  deps: ImageDiagnosticsDeps,
): Promise<ImageDiagnosticsReport> {
  const { platform, arch, nodeVersion } = deps

  const glibc = (await probe(deps.glibcVersion)).value as string | undefined

  // Presence-on-disk first: it separates "never traced into the bundle" from
  // "present but rejected", which is the whole point of the exercise.
  const packages: Record<string, ProbeResult> = {}
  for (const id of candidatePackages(platform, arch)) {
    packages[id] = await probe(() => deps.resolveModule(id))
  }

  const flags = (await probe(deps.readCpuFlags)).value as string | undefined

  const loaded = await probe(deps.loadSharp)
  const sharp: ImageDiagnosticsReport['sharp'] = { loaded: loaded.ok }
  if (!loaded.ok) {
    sharp.loadError = loaded.error
  } else {
    const mod = loaded.value as Record<string, unknown>
    sharp.versions = await probe(() => mod.versions)
    // Not a public API and not present in every release — probed, not called
    // blindly, so its absence is itself a reported data point.
    sharp.isUsingX64V2 = await probe(() => {
      const fn = mod._isUsingX64V2
      if (typeof fn !== 'function') return 'not exposed by this sharp version'
      return (fn as () => unknown)()
    })
    sharp.encode = await encodeProbe(mod)
  }

  const missing = missingX64V2Flags(flags)
  return {
    runtime: { platform, arch, node: nodeVersion, ...(glibc ? { glibc } : {}) },
    sharp,
    packages,
    cpu: { ...(flags ? { flags } : {}), ...(missing ? { missingX64V2Flags: missing } : {}) },
  }
}
