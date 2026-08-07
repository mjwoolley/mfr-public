// Unit tests for the pure exit-code logic of the post-deploy smoke.
// Plain node:test (no vitest) — scripts/ is outside the workspaces:
//   node --test scripts/smoke.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, runChecks, DENIED_STATUSES } from './smoke.mjs'

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

// --- the authorization layer -------------------------------------------------
// runChecks does I/O, so drive it with a stub `fetch` that answers per-path.
// `routes` maps a pathname to the status to return; anything unlisted is 200.

const ADMIN_PATHS = ['/admin', '/admin/users', '/accounting/admin']
const BASE = 'https://example.test'

async function withStubbedFetch(routes, fn) {
  const real = globalThis.fetch
  globalThis.fetch = async (url) => ({ status: routes[new URL(url).pathname] ?? 200 })
  try {
    // `await` here, not `return fn()` — the finally must not restore the real
    // fetch until every probe inside has actually resolved.
    return await fn()
  } finally {
    globalThis.fetch = real
  }
}

// Gated pages 307 for the anonymous layer; admin areas turn the member away.
const healthyRoutes = {
  '/photos': 307,
  '/photos/featured': 307,
  '/photos/history': 307,
  ...Object.fromEntries(ADMIN_PATHS.map((p) => [p, 307])),
}

const runSignedIn = (routes) =>
  withStubbedFetch(routes, () => runChecks(BASE, { SMOKE_SESSION_TOKEN: 'x'.repeat(24) }))

test('a healthy site passes every layer, including authorization', async () => {
  // The anon layer wants 307 on /photos*, the signed-in layer wants 200 on the
  // same paths — one stub can't satisfy both, so assert on the authz checks.
  const results = await runSignedIn(healthyRoutes)
  const authz = results.filter((r) => r.name.endsWith('→ denied'))
  assert.equal(authz.length, ADMIN_PATHS.length)
  assert.ok(
    authz.every((r) => r.ok),
    `expected all denials to pass, got ${JSON.stringify(authz)}`,
  )
})

test('an admin page reachable by a plain member is a critical failure', async () => {
  const results = await runSignedIn({ ...healthyRoutes, '/admin/users': 200 })
  const breach = results.find((r) => r.name === 'signed-in GET /admin/users → denied')
  assert.ok(breach, 'the /admin/users authorization check should exist')
  assert.equal(breach.ok, false)
  assert.equal(breach.critical, true, 'an authz hole must be able to trigger the rollback')
  assert.equal(classify(results).code, 1)
})

test('a 500 behind the gate is not accepted as a denial', async () => {
  const results = await runSignedIn({ ...healthyRoutes, '/admin': 500 })
  const crashed = results.find((r) => r.name === 'signed-in GET /admin → denied')
  assert.equal(crashed.ok, false, 'a crash must not read as a successful denial')
})

test('a changed denial mechanism (403) still passes', async () => {
  const results = await runSignedIn({ ...healthyRoutes, '/accounting/admin': 403 })
  const denied = results.find((r) => r.name === 'signed-in GET /accounting/admin → denied')
  assert.equal(denied.ok, true, '403 is a correct denial and must not roll a deploy back')
})

test('without a session token the authorization layer is skipped, not failed', async () => {
  const results = await withStubbedFetch(healthyRoutes, () => runChecks(BASE, {}))
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
