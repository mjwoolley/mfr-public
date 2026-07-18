// Deep health check for post-deploy smoke tests. Secret-gated (same Bearer
// CRON_SECRET as the cron) so it can probe things the public/anon surface can't:
//   - DB: query the photo tables — catches a branch that's missing schema (the
//     recurring "new tables not applied" failure).
//   - R2: a non-destructive put→head→delete round-trip — catches bad backup
//     credentials without writing anything to the real gallery.
// Returns { ok, checks } with 200 when all pass, 503 otherwise.

import { portalDb } from '@/lib/portalDb'
import { portalPhotos, portalPhotoSlides } from '@/lib/db/schema'
import { healthCheckR2 } from '@/lib/photos/backupStore'

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks: Record<string, unknown> = {}

  let dbOk = false
  try {
    await portalDb.select({ id: portalPhotos.id }).from(portalPhotos).limit(1)
    await portalDb.select({ id: portalPhotoSlides.id }).from(portalPhotoSlides).limit(1)
    dbOk = true
  } catch (error) {
    checks.dbError = (error as Error).message
  }
  checks.db = dbOk

  const r2 = await healthCheckR2()
  checks.r2 = r2.ok
  if (r2.detail) checks.r2Detail = r2.detail

  const ok = dbOk && r2.ok
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 })
}
