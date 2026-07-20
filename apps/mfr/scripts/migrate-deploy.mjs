// Deploy-time schema application. Runs pending Drizzle migrations (forward-only
// via the drizzle-orm migrator — safe, unlike `drizzle-kit push`), then applies
// push-only.sql (the GiST EXCLUDE / CHECK / triggers drizzle-kit can't emit;
// idempotent). Invoked by `vercel-build` before `next build`, and by `db:migrate`.
//
// Requires a direct (non-pooled) connection — DIRECT_URL, or DATABASE_URL_UNPOOLED
// on per-PR preview deploys (see resolveDirectUrl). Fails loudly if unset so a
// misconfigured deploy is obvious rather than silently skipping schema.

import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { resolveDirectUrl } from '../lib/db/directUrl.mjs'

const url = resolveDirectUrl()
if (!url) {
  console.error(
    'migrate-deploy: neither DIRECT_URL nor DATABASE_URL_UNPOOLED is set — cannot apply schema',
  )
  process.exit(1)
}

const sql = postgres(url, { max: 1 })
try {
  await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  const pushOnly = fs.readFileSync(path.join(process.cwd(), 'lib/db/push-only.sql'), 'utf8')
  await sql.unsafe(pushOnly)
  console.log('migrate-deploy: migrations + push-only.sql applied')
} catch (err) {
  console.error('migrate-deploy: failed', err)
  process.exitCode = 1
} finally {
  await sql.end()
}
