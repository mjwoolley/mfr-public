// Secret-gated sharp-loader diagnostic. Same Bearer CRON_SECRET gate as
// /api/health, because it reports runtime internals (module paths, CPU flags)
// that don't belong on the public surface.
//
// This is a REPORT, not a health gate: it returns 200 whenever the caller is
// authorized, even when every probe inside it failed. Nothing here should ever
// be wired into the post-deploy rollback path — see lib/photos/imageDiagnostics
// for what it's for and why it exists.
//
// Run it via the "Prod probe (manual)" workflow, which can point at production
// or at any preview URL — pointing it at a preview built with sharp 0.35.3 is
// how we find out why the native binary is rejected without risking prod.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildImageReport, parseCpuFlags } from '@/lib/photos/imageDiagnostics'

/**
 * Locate an optional `@img/*` package by walking `node_modules` up from the
 * working directory, and report its path + version.
 *
 * Deliberately filesystem-only. The obvious implementation —
 * `createRequire(import.meta.url).resolve(id)` — does not survive bundling:
 * the compiler rewrites a `require.resolve()` on a non-literal specifier and
 * every probe comes back "Cannot find module as expression is too dynamic",
 * which is indistinguishable from the package genuinely being absent. That
 * would silently destroy the one signal this route exists to provide. `fs` is
 * not rewritten, so this reports what is actually on disk in the deployed
 * bundle. Six levels up covers a monorepo's hoisted root from an app subdir.
 */
function probePackage(id: string): { path: string; version?: string } {
  const segments = id.split('/')
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'node_modules', ...segments)
    const manifest = join(candidate, 'package.json')
    if (existsSync(manifest)) {
      let version: string | undefined
      try {
        version = JSON.parse(readFileSync(manifest, 'utf8')).version
      } catch {
        // A present-but-unreadable manifest still proves the package shipped.
      }
      return { path: candidate, version }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`not found in any node_modules above ${process.cwd()}`)
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report = await buildImageReport({
    // `sharp` is a CommonJS module: the callable lives on `default` under an
    // ESM import. Dynamic so a load failure lands in the report rather than
    // 500-ing the route — a load failure is the single most interesting result.
    loadSharp: async () => {
      const mod = await import('sharp')
      return (mod as unknown as { default?: unknown }).default ?? mod
    },
    resolveModule: probePackage,
    // Throws off Linux; probe() reports that rather than losing the report.
    readCpuFlags: () => parseCpuFlags(readFileSync('/proc/cpuinfo', 'utf8')),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    // Node's own diagnostic report carries the runtime glibc version, so we can
    // answer the libc question without depending on sharp's detect-libc.
    glibcVersion: () => {
      const r = process.report?.getReport() as
        { header?: { glibcVersionRuntime?: string } } | undefined
      return r?.header?.glibcVersionRuntime
    },
  })

  return Response.json({ ok: true, report })
}
