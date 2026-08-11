// Unit tests for the pure exit-code logic of the post-deploy smoke.
// Plain node:test (no vitest) — scripts/ is outside the workspaces:
//   node --test scripts/smoke.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { classify, runChecks, DENIED_STATUSES, DRIVE_UNAVAILABLE } from './smoke.mjs'

const ok = (name, critical) => ({ name, ok: true, critical })
const bad = (name, critical) => ({ name, ok: false, critical })

test('all pass → code 0', () => {
  const { code, criticalFailures, nonCriticalFailures } = classify([
    ok('GET / → 200', true),
    ok('GET /api/health → ok', false),
  ])
  assert.equal(code, 0)
  assert.equal(criticalFailures.length, 0)
  assert.equal(nonCriticalFailures.length, 0)
})

test('a critical failure → code 1 (site broken)', () => {
  const { code, criticalFailures } = classify([
    bad('GET / → 200', true),
    ok('GET /api/health → ok', false),
  ])
  assert.equal(code, 1)
  assert.deepEqual(
    criticalFailures.map((r) => r.name),
    ['GET / → 200'],
  )
})

test('only a non-critical failure → code 3 (degraded)', () => {
  const { code, criticalFailures, nonCriticalFailures } = classify([
    ok('GET / → 200', true),
    bad('GET /api/health → ok', false),
  ])
  assert.equal(code, 3)
  assert.equal(criticalFailures.length, 0)
  assert.deepEqual(
    nonCriticalFailures.map((r) => r.name),
    ['GET /api/health → ok'],
  )
})

test('critical + non-critical both fail → code 1 (critical wins)', () => {
  const { code, criticalFailures, nonCriticalFailures } = classify([
    bad('signed-in GET /photos → 200', true),
    bad('GET /api/health → ok', false),
  ])
  assert.equal(code, 1)
  assert.equal(criticalFailures.length, 1)
  assert.equal(nonCriticalFailures.length, 1)
})

test('empty results → code 0', () => {
  assert.equal(classify([]).code, 0)
})

// --- driving runChecks -------------------------------------------------------
// runChecks does I/O, so drive it with a stub `fetch`.
//
// The stub answers per path AND per signed-in state, keyed on the Cookie header
// the signed-in layers send. That distinction is essential: a healthy site
// returns 307 on /photos when signed out and 200 when signed in, so a stub that
// only knows the path cannot represent "healthy" at all. Without it the baseline
// carries permanent critical failures, every exit-code assertion is 1 whatever
// happens, and a test asserting "a breach gives exit 1" passes with no breach.

// Must match runChecks. The bare `/admin` and `/accounting/admin` are
// deliberately NOT probed: they 307 to their first sub-tab for admins and
// members alike, so they can't discriminate.
const ADMIN_PATHS = [
  '/admin/schedule',
  '/admin/users',
  '/admin/activity',
  '/accounting/admin/transactions',
]
const GATED_PATHS = ['/photos', '/photos/featured', '/photos/history']
const BASE = 'https://example.test'

/** How a correctly-working deployment answers. */
function healthyResponse(path, signedIn) {
  if (GATED_PATHS.includes(path)) return signedIn ? 200 : 307
  if (ADMIN_PATHS.includes(path)) return 307 // the smoke user is a plain member
  if (path === '/documents') return { status: 200, body: '<h1>Family documents.</h1>' }
  return 200
}

/** Healthy everywhere except the paths named in `overrides`. */
async function withStubbedFetch(overrides, fn) {
  const real = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname
    const signedIn = Boolean(opts?.headers?.cookie)
    const hit = Object.hasOwn(overrides, path) ? overrides[path] : healthyResponse(path, signedIn)
    // A route maps to a bare status, or to { status, body } when a check reads
    // the response body (the Documents/Drive probe does).
    const { status, body } = typeof hit === 'number' ? { status: hit, body: '' } : hit
    return { status, text: async () => body ?? '' }
  }
  try {
    // `await` here, not `return fn()` — the finally must not restore the real
    // fetch until every probe inside has actually resolved.
    return await fn()
  } finally {
    globalThis.fetch = real
  }
}

const runSignedIn = (overrides = {}) =>
  withStubbedFetch(overrides, () => runChecks(BASE, { SMOKE_SESSION_TOKEN: 'x'.repeat(24) }))

test('a healthy site passes every layer and exits 0', async () => {
  const results = await runSignedIn()
  const failures = results.filter((r) => !r.ok)
  assert.deepEqual(failures, [], `expected no failures, got ${JSON.stringify(failures)}`)
  assert.equal(results.filter((r) => r.name.endsWith('→ denied')).length, ADMIN_PATHS.length)
  assert.equal(classify(results).code, 0)
})

test('an admin page reachable by a plain member is a critical failure', async () => {
  const results = await runSignedIn({ '/admin/users': 200 })
  const breach = results.find((r) => r.name === 'signed-in GET /admin/users → denied')
  assert.ok(breach, 'the /admin/users authorization check should exist')
  assert.equal(breach.ok, false)
  assert.equal(breach.critical, true, 'an authz hole must be able to trigger the rollback')
  // Meaningful only because the baseline is genuinely clean: the sole failure is
  // the breach.
  assert.deepEqual(
    results.filter((r) => !r.ok).map((r) => r.name),
    ['signed-in GET /admin/users → denied'],
  )
  assert.equal(classify(results).code, 1)
})

test('a 500 behind the gate is not accepted as a denial', async () => {
  const results = await runSignedIn({ '/admin/schedule': 500 })
  const crashed = results.find((r) => r.name === 'signed-in GET /admin/schedule → denied')
  assert.equal(crashed.ok, false, 'a crash must not read as a successful denial')
})

test('a changed denial mechanism (403) still passes', async () => {
  const results = await runSignedIn({ '/accounting/admin/transactions': 403 })
  const denied = results.find(
    (r) => r.name === 'signed-in GET /accounting/admin/transactions → denied',
  )
  assert.equal(denied.ok, true, '403 is a correct denial and must not roll a deploy back')
})

test('without a session token the authorization layer is skipped, not failed', async () => {
  const results = await withStubbedFetch({}, () => runChecks(BASE, {}))
  assert.equal(
    results.filter((r) => r.name.endsWith('→ denied')).length,
    0,
    'no authz checks without a session to test',
  )
  assert.equal(classify(results).code, 0)
})

test('DENIED_STATUSES excludes 200 and every 5xx', () => {
  assert.equal(DENIED_STATUSES.has(200), false)
  for (const s of [500, 502, 503]) assert.equal(DENIED_STATUSES.has(s), false)
})

// --- the Documents / Drive layer ---------------------------------------------

const DOCS = 'signed-in GET /documents → Drive reachable'

test('a healthy Documents page passes', async () => {
  const results = await runSignedIn({
    '/documents': { status: 200, body: '<h1>Family documents.</h1><ul><li>Bylaws.pdf</li></ul>' },
  })
  assert.equal(results.find((r) => r.name === DOCS).ok, true)
})

test('a 200 that says Drive is unavailable is still a failure', async () => {
  // The whole point: the page swallows Drive errors and returns 200, so a status
  // check alone would call this healthy.
  const results = await runSignedIn({
    '/documents': {
      status: 200,
      body: `<div>${DRIVE_UNAVAILABLE}</div>`,
    },
  })
  const docs = results.find((r) => r.name === DOCS)
  assert.equal(docs.ok, false)
  assert.match(docs.detail, /GOOGLE_DRIVE_SA_KEY/)
})

test('a broken Drive degrades (exit 3), it does not roll production back', async () => {
  // Rolling back cannot fix an expired key, revoked folder sharing, or a Google
  // outage — so this must never reach the critical/auto-rollback path.
  const results = await runSignedIn({
    '/documents': { status: 200, body: DRIVE_UNAVAILABLE },
  })
  assert.equal(results.find((r) => r.name === DOCS).critical, false)
  assert.equal(classify(results).code, 3)
})

test('a non-200 Documents page fails too', async () => {
  const results = await runSignedIn({ '/documents': 500 })
  const docs = results.find((r) => r.name === DOCS)
  assert.equal(docs.ok, false)
  assert.match(docs.detail, /500/)
})

test('DRIVE_UNAVAILABLE still matches the string the page renders', async () => {
  // Guards against the check quietly becoming a no-op: if someone rewrites that
  // copy in page.tsx, the smoke would pass forever while Documents is broken.
  const page = await readFile(
    new URL('../apps/mfr/app/documents/page.tsx', import.meta.url),
    'utf8',
  )
  assert.ok(
    page.includes(DRIVE_UNAVAILABLE),
    `app/documents/page.tsx no longer contains "${DRIVE_UNAVAILABLE}" — the smoke's ` +
      `Drive check is now a no-op. Update DRIVE_UNAVAILABLE in scripts/smoke.mjs to match.`,
  )
})
