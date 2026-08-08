// Unit tests for the ephemeral-Neon-branch helper. Plain node:test (no vitest)
// — scripts/ is outside the npm workspaces:
//   node --test scripts/neon-ci-branch.test.mjs
//
// The retry loop is the whole point of the script, so the cases that matter
// most here are "quota rejection then success" and "still exhausted at the cap".
// Time is injected (`now`/`sleep`), so these run instantly and deterministically.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUrl,
  connectionUrls,
  makeNeonApi,
  createWithWait,
  deleteByName,
  isQuotaError,
  isTransientError,
  outputLines,
  pooledUrl,
  resolveConnection,
  selectStaleCiBranches,
} from './neon-ci-branch.mjs'

const DIRECT =
  'postgresql://neondb_owner:pw@ep-x-1.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require'

// A fake clock: `now()` advances only when the code under test sleeps, so a
// 15-minute wait is exercised in microseconds and the give-up boundary is exact.
function fakeClock() {
  let t = 1_000_000
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms
    },
    advance: (ms) => {
      t += ms
    },
  }
}

// Scripted Neon API: `createResponses` is consumed one per attempt.
function fakeApi({ branches = [], createResponses = [], deleteStatus = 200 } = {}) {
  const calls = { creates: 0, deletes: [] }
  return {
    calls,
    listBranches: async () => ({ status: 200, body: { branches }, text: '' }),
    createBranch: async () => {
      const r = createResponses[calls.creates] ?? createResponses.at(-1)
      calls.creates += 1
      return r
    },
    deleteBranch: async (id) => {
      calls.deletes.push(id)
      return { status: deleteStatus, body: {}, text: '' }
    },
  }
}

const parent = { id: 'br-parent', name: 'production', created_at: '2026-01-01T00:00:00Z' }
const okCreate = {
  status: 201,
  text: '',
  body: {
    connection_uris: [
      { connection_uri: DIRECT, connection_parameters: { database: 'neondb', password: 'pw' } },
    ],
  },
}

// The HTTP layer. These assert the exact request shapes against Neon's v2 API
// spec — the one part that can't be caught until CI runs otherwise.
function recordingFetch(response = { status: 200, body: {} }) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return {
      status: response.status,
      text: async () => JSON.stringify(response.body),
    }
  }
  return { calls, fetchImpl }
}

test('makeNeonApi sends an authorized JSON GET for listBranches', async () => {
  const { calls, fetchImpl } = recordingFetch({ status: 200, body: { branches: [] } })
  const api = makeNeonApi({ apiKey: 'key123', projectId: 'proj', fetchImpl })
  const res = await api.listBranches()
  assert.equal(calls[0].url, 'https://console.neon.tech/api/v2/projects/proj/branches')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer key123')
  assert.deepEqual(res.body, { branches: [] })
})

test('makeNeonApi POSTs the branch+endpoints body the v2 spec requires', async () => {
  const { calls, fetchImpl } = recordingFetch({ status: 201, body: {} })
  const api = makeNeonApi({ apiKey: 'k', projectId: 'proj', fetchImpl })
  await api.createBranch({ name: 'ci-1-1-int', parentId: 'br-parent' })
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    branch: { name: 'ci-1-1-int', parent_id: 'br-parent' },
    endpoints: [{ type: 'read_write' }],
  })
})

test('makeNeonApi DELETEs by branch id and url-encodes the reveal role', async () => {
  const { calls, fetchImpl } = recordingFetch()
  const api = makeNeonApi({ apiKey: 'k', projectId: 'proj', fetchImpl })
  await api.deleteBranch('br-x')
  assert.equal(calls[0].url, 'https://console.neon.tech/api/v2/projects/proj/branches/br-x')
  assert.equal(calls[0].init.method, 'DELETE')
  await api.revealPassword('br-x', 'neon db/owner')
  assert.equal(
    calls[1].url,
    'https://console.neon.tech/api/v2/projects/proj/branches/br-x/roles/neon%20db%2Fowner/reveal_password',
  )
})

test('makeNeonApi surfaces a non-JSON error body instead of crashing', async () => {
  const fetchImpl = async () => ({ status: 502, text: async () => '<html>bad gateway</html>' })
  const api = makeNeonApi({ apiKey: 'k', projectId: 'proj', fetchImpl })
  const res = await api.listBranches()
  assert.equal(res.status, 502)
  assert.equal(res.text, '<html>bad gateway</html>')
})

test('pooledUrl inserts -pooler into the endpoint id', () => {
  assert.equal(new URL(pooledUrl(DIRECT)).hostname, 'ep-x-1-pooler.c-3.us-east-2.aws.neon.tech')
})

test('pooledUrl is idempotent on an already-pooled url', () => {
  const already = DIRECT.replace('ep-x-1.', 'ep-x-1-pooler.')
  assert.equal(pooledUrl(already), already)
})

// The exact payload observed from Neon while three CI runs contended for the
// branch cap. Pinned so a future refactor of isQuotaError can't stop matching
// the one response that actually occurs in production.
const REAL_QUOTA_BODY =
  '{"request_id":"85633798-22cc-45d2-a6ac-a319bb65e2bc","code":"BRANCHES_LIMIT_EXCEEDED","message":"branches limit exceeded"}'

test('isQuotaError matches the real BRANCHES_LIMIT_EXCEEDED response', () => {
  assert.equal(isQuotaError(422, REAL_QUOTA_BODY), true)
  // …and on the body alone, in case the status changes in a future API revision.
  assert.equal(isQuotaError(400, REAL_QUOTA_BODY), true)
})

test('isQuotaError matches the statuses and the message Neon uses', () => {
  assert.equal(isQuotaError(422, ''), true)
  assert.equal(isQuotaError(423, ''), true)
  assert.equal(isQuotaError(429, ''), true)
  assert.equal(isQuotaError(400, 'branch limit exceeded for this project'), true)
  // A genuine bad request must NOT be mistaken for a full queue and retried.
  assert.equal(isQuotaError(400, 'invalid parent_id'), false)
  assert.equal(isQuotaError(401, 'unauthorized'), false)
})

test('isTransientError covers 5xx only', () => {
  assert.equal(isTransientError(503), true)
  assert.equal(isTransientError(404), false)
})

test('connectionUrls prefers the neondb entry and uses pooler_host when given', () => {
  const { direct, pooled, password } = connectionUrls({
    connection_uris: [
      {
        connection_uri: 'postgresql://o:p@ep-y-9.c-3.us-east-2.aws.neon.tech/other',
        connection_parameters: { database: 'other', password: 'p' },
      },
      {
        connection_uri: DIRECT,
        connection_parameters: {
          database: 'neondb',
          password: 'pw',
          pooler_host: 'ep-x-1-pooler.c-3.us-east-2.aws.neon.tech',
        },
      },
    ],
  })
  assert.equal(direct, DIRECT)
  assert.equal(new URL(pooled).hostname, 'ep-x-1-pooler.c-3.us-east-2.aws.neon.tech')
  assert.equal(password, 'pw')
})

// The shape CI actually gets: `production` owns both `neondb` and the seeded
// `postgres` maintenance database, and Neon omits connection_uris entirely when
// the parent has more than one database. Everything below covers that path.
const multiDbCreate = {
  branch: { id: 'br-new' },
  endpoints: [{ host: 'ep-x-1.c-3.us-east-2.aws.neon.tech' }],
  databases: [
    { name: 'postgres', owner_name: 'neondb_owner' },
    { name: 'neondb', owner_name: 'neondb_owner' },
  ],
  roles: [{ name: 'neondb_owner', password: 'pw' }],
}

test('buildUrl escapes credentials that need it', () => {
  assert.equal(
    buildUrl({ host: 'h', database: 'd', role: 'r@x', password: 'p/w?' }),
    'postgresql://r%40x:p%2Fw%3F@h/d?sslmode=require',
  )
})

test('connectionUrls assembles URLs when Neon omits connection_uris', () => {
  const { direct, pooled, password, needsPassword } = connectionUrls(multiDbCreate)
  assert.equal(needsPassword, undefined)
  assert.equal(password, 'pw')
  // The app database, never the `postgres` maintenance one.
  assert.equal(new URL(direct).pathname, '/neondb')
  assert.equal(new URL(direct).hostname, 'ep-x-1.c-3.us-east-2.aws.neon.tech')
  assert.equal(new URL(pooled).hostname, 'ep-x-1-pooler.c-3.us-east-2.aws.neon.tech')
})

test('connectionUrls asks for a password reveal when the role carries none', () => {
  const r = connectionUrls({ ...multiDbCreate, roles: [{ name: 'neondb_owner' }] })
  assert.equal(r.needsPassword, true)
  assert.equal(r.role, 'neondb_owner')
  assert.equal(r.database, 'neondb')
  assert.equal(r.poolerHost, 'ep-x-1-pooler.c-3.us-east-2.aws.neon.tech')
})

test('connectionUrls throws when there is nothing to build a URL from', () => {
  assert.throws(
    () => connectionUrls({ connection_uris: [] }),
    /neither connection_uris nor an endpoint/,
  )
})

test('connectionUrls throws when the branch has no databases', () => {
  assert.throws(
    () => connectionUrls({ endpoints: [{ host: 'h.example' }], databases: [] }),
    /returned no databases/,
  )
})

test('resolveConnection passes through when no reveal is needed', async () => {
  const api = { revealPassword: async () => assert.fail('should not reveal') }
  const { direct } = await resolveConnection(api, multiDbCreate)
  assert.match(direct, /neondb_owner:pw@/)
})

test('resolveConnection reveals the password and builds both URLs', async () => {
  const seen = []
  const api = {
    revealPassword: async (branchId, role) => {
      seen.push([branchId, role])
      return { status: 200, body: { password: 'revealed' } }
    },
  }
  const { direct, pooled } = await resolveConnection(api, {
    ...multiDbCreate,
    roles: [{ name: 'neondb_owner' }],
  })
  assert.deepEqual(seen, [['br-new', 'neondb_owner']])
  assert.match(direct, /neondb_owner:revealed@ep-x-1\./)
  assert.match(pooled, /neondb_owner:revealed@ep-x-1-pooler\./)
})

test('resolveConnection surfaces a failed reveal instead of emitting a broken URL', async () => {
  const api = { revealPassword: async () => ({ status: 403, body: {} }) }
  await assert.rejects(
    resolveConnection(api, { ...multiDbCreate, roles: [{ name: 'neondb_owner' }] }),
    /reveal_password failed for role neondb_owner \(403\)/,
  )
})

test('outputLines emits exactly the names ci.yml consumes', () => {
  assert.deepEqual(outputLines({ direct: 'a', pooled: 'b' }), ['db_url=a', 'db_url_pooled=b'])
})

test('selectStaleCiBranches only ever returns old ci-* branches', () => {
  const nowMs = Date.parse('2026-08-07T12:00:00Z')
  const hoursAgo = (h) => new Date(nowMs - h * 3600_000).toISOString()
  const stale = selectStaleCiBranches(
    [
      { name: 'production', created_at: hoursAgo(500) },
      { name: 'main', created_at: hoursAgo(500) },
      { name: 'dev', created_at: hoursAgo(500) },
      { name: 'preview/some-pr', created_at: hoursAgo(500) },
      { name: 'ci-1-1-int', created_at: hoursAgo(5) }, // leaked
      { name: 'ci-2-1-e2e', created_at: hoursAgo(0.1) }, // a live run — leave alone
      { name: 'ci-mine', created_at: hoursAgo(9) }, // ours, never sweep
    ],
    { nowMs, keepName: 'ci-mine' },
  )
  assert.deepEqual(
    stale.map((b) => b.name),
    ['ci-1-1-int'],
  )
})

test('createWithWait returns on the first attempt when a slot is free', async () => {
  const clock = fakeClock()
  const api = fakeApi({ branches: [parent], createResponses: [okCreate] })
  const body = await createWithWait(api, {
    branchName: 'ci-1-1-int',
    parentBranch: 'production',
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
  })
  assert.equal(api.calls.creates, 1)
  assert.equal(connectionUrls(body).direct, DIRECT)
  assert.deepEqual(api.calls.deletes, [], 'must not sweep anything on a clean first attempt')
})

test('createWithWait waits out a quota rejection and then succeeds', async () => {
  const clock = fakeClock()
  const api = fakeApi({
    branches: [parent],
    createResponses: [{ status: 422, text: 'branch limit exceeded', body: {} }, okCreate],
  })
  const body = await createWithWait(api, {
    branchName: 'ci-1-1-int',
    parentBranch: 'production',
    pollMs: 20_000,
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
  })
  assert.equal(api.calls.creates, 2)
  assert.ok(body.connection_uris.length > 0)
})

test('createWithWait sweeps leaked ci-* branches before retrying', async () => {
  const clock = fakeClock()
  const leaked = {
    id: 'br-leaked',
    name: 'ci-old-1-int',
    created_at: new Date(clock.now() - 5 * 3600_000).toISOString(),
  }
  const api = fakeApi({
    branches: [parent, leaked],
    createResponses: [{ status: 422, text: 'branch limit exceeded', body: {} }, okCreate],
  })
  await createWithWait(api, {
    branchName: 'ci-1-1-int',
    parentBranch: 'production',
    pollMs: 1000,
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
  })
  assert.deepEqual(api.calls.deletes, ['br-leaked'])
})

test('createWithWait gives up with a capacity message once past the cap', async () => {
  const clock = fakeClock()
  const api = fakeApi({
    branches: [parent],
    createResponses: [{ status: 422, text: 'branch limit exceeded', body: {} }],
  })
  await assert.rejects(
    createWithWait(api, {
      branchName: 'ci-1-1-int',
      parentBranch: 'production',
      maxWaitMs: 60_000,
      pollMs: 20_000,
      sleep: clock.sleep,
      now: clock.now,
      log: () => {},
    }),
    /quota still exhausted after 1 min .* real capacity problem/s,
  )
  // 3 attempts fit inside a 60s budget at a 20s poll; the 4th would cross it.
  assert.equal(api.calls.creates, 3)
})

test('createWithWait fails fast on a non-retryable error', async () => {
  const clock = fakeClock()
  const api = fakeApi({
    branches: [parent],
    createResponses: [{ status: 401, text: 'unauthorized', body: {} }],
  })
  await assert.rejects(
    createWithWait(api, {
      branchName: 'ci-1-1-int',
      parentBranch: 'production',
      sleep: clock.sleep,
      now: clock.now,
      log: () => {},
    }),
    /create branch failed — 401/,
  )
  assert.equal(api.calls.creates, 1, 'a bad API key must not be retried for 15 minutes')
})

test('createWithWait names the parent it could not find', async () => {
  const api = fakeApi({ branches: [{ id: 'br-a', name: 'main' }] })
  await assert.rejects(
    createWithWait(api, { branchName: 'ci-1-1-int', parentBranch: 'production', log: () => {} }),
    /parent branch "production" not found/,
  )
})

test('deleteByName deletes the matching branch', async () => {
  const api = fakeApi({ branches: [parent, { id: 'br-mine', name: 'ci-1-1-int' }] })
  assert.equal(await deleteByName(api, { branchName: 'ci-1-1-int', log: () => {} }), true)
  assert.deepEqual(api.calls.deletes, ['br-mine'])
})

test('deleteByName is idempotent when the branch is already gone', async () => {
  const api = fakeApi({ branches: [parent] })
  assert.equal(await deleteByName(api, { branchName: 'ci-1-1-int', log: () => {} }), false)
  assert.deepEqual(api.calls.deletes, [])
})

test('deleteByName tolerates a 404 from a concurrent delete', async () => {
  const api = fakeApi({
    branches: [parent, { id: 'br-mine', name: 'ci-1-1-int' }],
    deleteStatus: 404,
  })
  assert.equal(await deleteByName(api, { branchName: 'ci-1-1-int', log: () => {} }), false)
})

test('deleteByName surfaces a real delete failure', async () => {
  const api = fakeApi({
    branches: [parent, { id: 'br-mine', name: 'ci-1-1-int' }],
    deleteStatus: 500,
  })
  await assert.rejects(
    deleteByName(api, { branchName: 'ci-1-1-int', log: () => {} }),
    /delete branch failed \(500\)/,
  )
})
