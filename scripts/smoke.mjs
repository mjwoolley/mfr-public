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
//
// Severity split — each check is `critical` or not, and the exit code reflects
// which class failed, so the post-deploy workflow can auto-rollback a broken
// *site* (critical) without reacting to a deep probe/config check (non-critical,
// e.g. a wrong CRON_SECRET) that leaves the user-facing site perfectly up:
//   0 — all checks passed
//   1 — ≥1 *critical* (user-facing) check failed → site is broken
//   3 — only *non-critical* (probe/config) checks failed → site is up
//   2 — usage error (no base URL)

import { pathToFileURL } from 'node:url'

// Pure: given the collected results, decide the exit code and group the
// failures by severity. No I/O — unit-testable in isolation.
export function classify(results) {
  const failures = results.filter((r) => !r.ok)
  const criticalFailures = failures.filter((r) => r.critical)
  const nonCriticalFailures = failures.filter((r) => !r.critical)
  const code = failures.length === 0 ? 0 : criticalFailures.length > 0 ? 1 : 3
  return { code, criticalFailures, nonCriticalFailures }
}

// Run every layer against `base` and return the flat results array. Each result
// is { name, ok, critical, detail }. Skipped layers push a passing, non-critical
// placeholder so partial secret setup degrades to a shallower smoke.
export async function runChecks(base, env = process.env) {
  const isHttps = base.startsWith('https://')
  const results = []
  const check = (name, ok, critical, detail) => results.push({ name, ok: !!ok, critical, detail })

  // A network throw (DNS/connection refused = site totally down) becomes a
  // failed check of the layer's own severity, not a process crash — so the
  // exit code stays meaningful (a critical fetch throwing → code 1 → rollback).
  const probe = async (name, critical, predicate, url, opts) => {
    try {
      const r = await fetch(url, opts)
      const { ok, detail } = await predicate(r)
      check(name, ok, critical, detail)
    } catch (e) {
      check(name, false, critical, `fetch failed: ${e.message}`)
    }
  }

  // 1. anonymous — a down site or broken home query is user-facing → critical.
  await probe(
    'GET / → 200',
    true,
    (r) => ({ ok: r.status === 200, detail: `got ${r.status}` }),
    `${base}/`,
    {
      redirect: 'manual',
    },
  )
  for (const p of ['/photos', '/photos/2026', '/photos/people']) {
    await probe(
      `GET ${p} → 307 (gated)`,
      true,
      (r) => ({ ok: r.status === 307, detail: `got ${r.status}` }),
      `${base}${p}`,
      { redirect: 'manual' },
    )
  }

  // 2. health — DB + R2 deep probe. A bad CRON_SECRET fails this without the
  //    site being down, so it is non-critical (won't trigger a rollback).
  if (env.CRON_SECRET) {
    await probe(
      'GET /api/health → ok',
      false,
      async (h) => {
        const body = await h.json().catch(() => ({}))
        return { ok: h.status === 200 && body.ok === true, detail: JSON.stringify(body) }
      },
      `${base}/api/health`,
      { headers: { authorization: `Bearer ${env.CRON_SECRET}` } },
    )
  } else {
    check('health (skipped — no CRON_SECRET)', true, false)
  }

  // 3. signed-in read-only — exercises the gated DB queries; a 500 here means
  //    the real user-facing gallery is broken → critical.
  if (env.SMOKE_SESSION_TOKEN) {
    const cookieName = isHttps ? '__Secure-authjs.session-token' : 'authjs.session-token'
    const cookie = `${cookieName}=${env.SMOKE_SESSION_TOKEN}`
    for (const p of ['/photos/2026', '/photos/people']) {
      await probe(
        `signed-in GET ${p} → 200`,
        true,
        (r) => ({ ok: r.status === 200, detail: `got ${r.status}` }),
        `${base}${p}`,
        { headers: { cookie }, redirect: 'manual' },
      )
    }
  } else {
    check('signed-in (skipped — no SMOKE_SESSION_TOKEN)', true, false)
  }

  return results
}

async function main() {
  const base = (process.argv[2] || process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '')
  if (!base) {
    console.error('usage: node scripts/smoke.mjs <base-url>')
    process.exit(2)
  }

  const results = await runChecks(base)
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.detail ?? ''}`}`)
  }

  const { code, criticalFailures, nonCriticalFailures } = classify(results)
  if (code === 0) {
    console.log(`\nSMOKE PASSED @ ${base}`)
  } else {
    const parts = []
    if (criticalFailures.length) {
      parts.push(
        `${criticalFailures.length} critical: ${criticalFailures.map((r) => r.name).join(', ')}`,
      )
    }
    if (nonCriticalFailures.length) {
      parts.push(
        `${nonCriticalFailures.length} non-critical: ${nonCriticalFailures.map((r) => r.name).join(', ')}`,
      )
    }
    const verdict = code === 1 ? 'SMOKE FAILED (site broken)' : 'SMOKE DEGRADED (probe/config only)'
    console.log(`\n${verdict} @ ${base} — ${parts.join(' · ')}`)
  }
  process.exit(code)
}

// Only run the network smoke when invoked directly (not when imported by a test).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
