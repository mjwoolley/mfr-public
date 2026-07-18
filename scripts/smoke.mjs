// Post-deploy smoke test against a deployed base URL. Non-destructive.
//
//   node scripts/smoke.mjs https://staging.millerfamilyreunions.org
//   CRON_SECRET=... SMOKE_SESSION_TOKEN=... node scripts/smoke.mjs https://millerfamilyreunions.org
//
// Layers (each optional layer is skipped, not failed, when its secret is absent):
//   1. Anonymous  — `/` is 200 (public; also proves the home DB read works);
//      gated pages redirect (307). Catches a down site / broken home query.
//   2. Health     — GET /api/health with CRON_SECRET → { ok:true } (DB + R2).
//   3. Signed-in  — with SMOKE_SESSION_TOKEN, GET the gated gallery pages and
//      expect 200. This actually runs the gated `portal_photos` queries (the
//      anon 307 never does), so it catches a schema-missing 500 behind the gate.

const base = (process.argv[2] || process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '')
if (!base) {
  console.error('usage: node scripts/smoke.mjs <base-url>')
  process.exit(2)
}
const isHttps = base.startsWith('https://')
const results = []
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail })

// 1. anonymous
const home = await fetch(`${base}/`, { redirect: 'manual' })
check('GET / → 200', home.status === 200, `got ${home.status}`)
for (const p of ['/photos', '/photos/2026', '/photos/people']) {
  const r = await fetch(`${base}${p}`, { redirect: 'manual' })
  check(`GET ${p} → 307 (gated)`, r.status === 307, `got ${r.status}`)
}

// 2. health
if (process.env.CRON_SECRET) {
  const h = await fetch(`${base}/api/health`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const body = await h.json().catch(() => ({}))
  check('GET /api/health → ok', h.status === 200 && body.ok === true, JSON.stringify(body))
} else {
  check('health (skipped — no CRON_SECRET)', true)
}

// 3. signed-in read-only (exercises the gated DB queries)
if (process.env.SMOKE_SESSION_TOKEN) {
  const cookieName = isHttps ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const cookie = `${cookieName}=${process.env.SMOKE_SESSION_TOKEN}`
  for (const p of ['/photos/2026', '/photos/people']) {
    const r = await fetch(`${base}${p}`, { headers: { cookie }, redirect: 'manual' })
    check(`signed-in GET ${p} → 200`, r.status === 200, `got ${r.status}`)
  }
} else {
  check('signed-in (skipped — no SMOKE_SESSION_TOKEN)', true)
}

let failed = 0
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.detail ?? ''}`}`)
  if (!r.ok) failed += 1
}
console.log(
  failed
    ? `\nSMOKE FAILED (${failed} check${failed === 1 ? '' : 's'}) @ ${base}`
    : `\nSMOKE PASSED @ ${base}`,
)
process.exit(failed ? 1 : 0)
