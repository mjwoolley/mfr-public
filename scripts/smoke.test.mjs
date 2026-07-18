// Unit tests for the pure exit-code logic of the post-deploy smoke.
// Plain node:test (no vitest) — scripts/ is outside the workspaces:
//   node --test scripts/smoke.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './smoke.mjs'

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
    bad('signed-in GET /photos/2026 → 200', true),
    bad('GET /api/health → ok', false),
  ])
  assert.equal(code, 1)
  assert.equal(criticalFailures.length, 1)
  assert.equal(nonCriticalFailures.length, 1)
})

test('empty results → code 0', () => {
  assert.equal(classify([]).code, 0)
})
