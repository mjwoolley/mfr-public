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

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { buildImageReport } from '@/lib/photos/imageDiagnostics'

const require = createRequire(import.meta.url)

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
    resolveModule: (id) => require.resolve(id),
    readCpuFlags: () => {
      const line = readFileSync('/proc/cpuinfo', 'utf8')
        .split('\n')
        .find((l) => l.startsWith('flags'))
      return line?.split(':').slice(1).join(':').trim()
    },
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
