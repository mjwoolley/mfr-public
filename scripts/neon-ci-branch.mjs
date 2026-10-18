// Create / delete the ephemeral Neon branch a CI job runs against.
//
//   node scripts/neon-ci-branch.mjs create ci-123-1-int
//   node scripts/neon-ci-branch.mjs delete ci-123-1-int
//   node scripts/neon-ci-branch.mjs clone-shards ci-123-1-int int_shard_1 int_shard_2
//   node scripts/neon-ci-branch.mjs connect ci-123-1-int int_shard_1
//
// Replaces neondatabase/create-branch-action + delete-branch-action. The reason
// is not the actions themselves — it is what we had to wrap around them.
//
// The Neon project caps how many branches can exist at once, and CI forks one
// per DB job. Previously `integration` and `e2e` each carried a repo-global
// GitHub `concurrency:` group so they'd queue instead of hitting that cap with a
// 422. But GitHub keeps only ONE pending job per concurrency group: when a third
// run arrives, whichever job was *waiting* is cancelled outright — and
// `cancel-in-progress: false` protects the running job, never the pending one.
// So any burst of 3+ overlapping runs silently cancelled the middle one's DB
// jobs, and `ci-ok` (which demands `success`, not `cancelled`) went red on a PR
// that had nothing wrong with it. Dependabot's weekly batch guaranteed bursts.
//
// The fix is to queue *inside* the job instead: attempt the create, and when
// Neon says "out of branches", wait and try again. A waiting job is never
// evicted. We deliberately do NOT try to compute remaining quota from the API —
// attempting the create and reacting to the real rejection is the honest signal
// and survives a plan change.
//
// `create` writes `db_url` (direct) and `db_url_pooled` to $GITHUB_OUTPUT, the
// same output names the old action used, so the workflow steps that consume
// them are untouched.
//
// Exit codes: 0 ok · 1 failure (including quota still exhausted at the cap) ·
// 2 usage error.

import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const NEON_API = 'https://console.neon.tech/api/v2'

// How long to keep waiting for a free branch slot before declaring the quota
// genuinely exhausted. Comfortably longer than a DB job (~5 min) so a queue two
// or three deep drains, but short enough to fail with a real message instead of
// hanging to the job's `timeout-minutes`.
export const MAX_WAIT_MS = 15 * 60 * 1000
export const POLL_MS = 20 * 1000

// A `ci-*` branch older than this was leaked by a crashed runner — no CI job
// lives anywhere near two hours. Sweeping these while we wait lets a blocked run
// unstick itself instead of waiting for the nightly cleanup-neon.yml.
export const STALE_CI_AGE_MS = 2 * 60 * 60 * 1000

/**
 * Does this response mean "no branch slots left" (as opposed to a real error)?
 *
 * Observed live while three CI runs contended for the cap:
 *   422 {"code":"BRANCHES_LIMIT_EXCEEDED","message":"branches limit exceeded"}
 *
 * The body is matched as well as the status because the status alone has not
 * been stable across Neon API revisions, and misreading a quota rejection as a
 * hard error is the failure this whole script exists to prevent.
 */
export function isQuotaError(status, bodyText = '') {
  if (status === 422 || status === 423 || status === 429) return true
  return /branch.*(limit|quota)|limit.*branch|exceeded/i.test(bodyText)
}

/** Transient server-side failures worth another attempt. */
export function isTransientError(status) {
  return status === 500 || status === 502 || status === 503 || status === 504
}

/**
 * Derive the pooled connection URL from a direct one by inserting `-pooler` into
 * the endpoint id: ep-x-123.c-3.us-east-2.aws.neon.tech
 *              → ep-x-123-pooler.c-3.us-east-2.aws.neon.tech
 * Only used when the API response omits `pooler_host`, which it usually
 * includes; kept because the pooled URL is what the app connects through and a
 * wrong host would surface as a confusing connection error mid-suite.
 */
export function pooledUrl(directUrl) {
  const u = new URL(directUrl)
  const [endpoint, ...rest] = u.hostname.split('.')
  if (endpoint.endsWith('-pooler')) return directUrl
  u.hostname = [`${endpoint}-pooler`, ...rest].join('.')
  return u.toString()
}

/**
 * Which `ci-*` branches are old enough to be leaks? Never returns the branch we
 * are about to create (`keepName`), and never anything outside the `ci-` prefix
 * — `production`, `main` and `dev` must be untouchable by this path.
 */
export function selectStaleCiBranches(branches, { nowMs, maxAgeMs = STALE_CI_AGE_MS, keepName }) {
  return branches.filter(
    (b) =>
      typeof b.name === 'string' &&
      b.name.startsWith('ci-') &&
      b.name !== keepName &&
      nowMs - Date.parse(b.created_at) > maxAgeMs,
  )
}

/** The application database. Neon seeds every project with a `postgres`
 *  maintenance database alongside it, which is never the one we want. */
export const APP_DATABASE = 'neondb'

/** Assemble a libpq URL. `sslmode=require` matches what Neon hands out. */
export function buildUrl({ host, database, role, password }) {
  return `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`
}

/**
 * Pull the direct + pooled URLs out of a create-branch response.
 *
 * Two shapes to handle. Normally Neon returns `connection_uris`, one entry per
 * (database, role) — but **not when the parent branch has more than one role or
 * database**, which is exactly our case: `production` carries both `neondb` and
 * the seeded `postgres` maintenance database. So the fallback (assemble the URL
 * from endpoints + databases + roles) is the path CI actually takes, not a
 * theoretical one. It is listed second only because the first is cheaper.
 *
 * Returns `{ direct, pooled, password }`, or `{ needsPassword: true, ... }` when
 * everything but the credential is known — the caller then reveals it, rather
 * than this staying an async function for one uncommon branch.
 */
export function connectionUrls(created) {
  const uris = created?.connection_uris ?? []
  if (uris.length > 0) {
    const entry = uris.find((u) => u.connection_parameters?.database === APP_DATABASE) ?? uris[0]
    const direct = entry.connection_uri
    const poolerHost = entry.connection_parameters?.pooler_host
    let pooled
    if (poolerHost) {
      const u = new URL(direct)
      u.hostname = poolerHost
      pooled = u.toString()
    } else {
      pooled = pooledUrl(direct)
    }
    return { direct, pooled, password: entry.connection_parameters?.password }
  }

  const endpoint = (created?.endpoints ?? [])[0]
  if (!endpoint?.host) {
    throw new Error('Neon created the branch but returned neither connection_uris nor an endpoint')
  }
  const databases = created?.databases ?? []
  const db =
    databases.find((d) => d.name === APP_DATABASE) ??
    databases.find((d) => d.name !== 'postgres') ??
    databases[0]
  if (!db) throw new Error('Neon created the branch but returned no databases')

  const role = db.owner_name
  const [ep, ...rest] = endpoint.host.split('.')
  const poolerHost = [`${ep}-pooler`, ...rest].join('.')
  const password = (created?.roles ?? []).find((r) => r.name === role)?.password

  if (!password) {
    return { needsPassword: true, host: endpoint.host, poolerHost, database: db.name, role }
  }
  return {
    direct: buildUrl({ host: endpoint.host, database: db.name, role, password }),
    pooled: buildUrl({ host: poolerHost, database: db.name, role, password }),
    password,
  }
}

/** Thin Neon REST wrapper. Every method returns { status, body } — never throws
 *  on a non-2xx, so the retry loop decides what is fatal. */
export function makeNeonApi({ apiKey, projectId, fetchImpl = fetch }) {
  const call = async (path, init = {}) => {
    const res = await fetchImpl(`${NEON_API}/projects/${projectId}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const text = await res.text()
    let body
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { raw: text }
    }
    return { status: res.status, body, text }
  }

  return {
    listBranches: () => call('/branches'),
    createBranch: ({ name, parentId }) =>
      call('/branches', {
        method: 'POST',
        body: JSON.stringify({
          branch: { name, parent_id: parentId },
          endpoints: [{ type: 'read_write' }],
        }),
      }),
    deleteBranch: (id) => call(`/branches/${id}`, { method: 'DELETE' }),
    revealPassword: (branchId, roleName) =>
      call(`/branches/${branchId}/roles/${encodeURIComponent(roleName)}/reveal_password`),
    listDatabases: (branchId) => call(`/branches/${branchId}/databases`),
    connectionUri: ({ branchId, database, role }) =>
      call(
        `/connection_uri?${new URLSearchParams({
          branch_id: branchId,
          database_name: database,
          role_name: role,
          pooled: 'false',
        })}`,
      ),
  }
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Create `branchName` off `parentBranch`, waiting out branch-quota rejections.
 * Returns the create response body. Throws with a specific message when the
 * quota is still exhausted at the cap — a genuine quota problem must stay loud.
 */
export async function createWithWait(
  api,
  {
    branchName,
    parentBranch,
    maxWaitMs = MAX_WAIT_MS,
    pollMs = POLL_MS,
    staleAgeMs = STALE_CI_AGE_MS,
    sleep = defaultSleep,
    now = () => Date.now(),
    log = console.log,
  },
) {
  const deadline = now() + maxWaitMs
  let attempt = 0
  let lastDetail = ''

  for (;;) {
    attempt += 1

    // Re-listed every attempt: the parent id is cheap to fetch and the same call
    // gives us the branch inventory we need to sweep leaks.
    const listed = await api.listBranches()
    if (listed.status !== 200) {
      throw new Error(`Neon list branches failed (${listed.status}): ${listed.text ?? ''}`)
    }
    const branches = listed.body.branches ?? []
    const parent = branches.find((b) => b.name === parentBranch)
    if (!parent) {
      throw new Error(
        `parent branch "${parentBranch}" not found in project (have: ${branches.map((b) => b.name).join(', ')})`,
      )
    }

    if (attempt > 1) {
      const stale = selectStaleCiBranches(branches, {
        nowMs: now(),
        maxAgeMs: staleAgeMs,
        keepName: branchName,
      })
      for (const b of stale) {
        log(`sweeping leaked CI branch ${b.name} (${b.id}), created ${b.created_at}`)
        await api.deleteBranch(b.id)
      }
    }

    const created = await api.createBranch({ name: branchName, parentId: parent.id })
    if (created.status >= 200 && created.status < 300) {
      log(`created Neon branch ${branchName} off ${parentBranch} (attempt ${attempt})`)
      return created.body
    }

    lastDetail = `${created.status}: ${created.text ?? ''}`
    const retryable =
      isQuotaError(created.status, created.text ?? '') || isTransientError(created.status)
    if (!retryable) throw new Error(`Neon create branch failed — ${lastDetail}`)

    if (now() + pollMs >= deadline) break
    log(
      `no Neon branch slot yet (attempt ${attempt}, ${lastDetail.slice(0, 200)}) — retrying in ${pollMs / 1000}s`,
    )
    await sleep(pollMs)
  }

  throw new Error(
    `Neon branch quota still exhausted after ${Math.round(maxWaitMs / 60000)} min — ` +
      `this is a real capacity problem, not a queue. Last response — ${lastDetail}`,
  )
}

/** Delete by name. Idempotent: a branch that is already gone is a success, so
 *  the `if: always()` cleanup step never turns a green run red. */
export async function deleteByName(api, { branchName, log = console.log }) {
  const listed = await api.listBranches()
  if (listed.status !== 200) {
    throw new Error(`Neon list branches failed (${listed.status}): ${listed.text ?? ''}`)
  }
  const branch = (listed.body.branches ?? []).find((b) => b.name === branchName)
  if (!branch) {
    log(`Neon branch ${branchName} already gone — nothing to delete`)
    return false
  }
  const res = await api.deleteBranch(branch.id)
  if (res.status === 404) {
    log(`Neon branch ${branchName} already gone — nothing to delete`)
    return false
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Neon delete branch failed (${res.status}): ${res.text ?? ''}`)
  }
  log(`deleted Neon branch ${branchName}`)
  return true
}

/** The `key=value` lines to append to $GITHUB_OUTPUT. Pure, so the exact output
 *  contract the workflow depends on is asserted in tests. */
export function outputLines({ direct, pooled }) {
  return [`db_url=${direct}`, `db_url_pooled=${pooled}`]
}

/**
 * connectionUrls() plus the credential fetch it can't do synchronously. Split
 * this way so the URL assembly stays pure and testable, and only the one call
 * that needs the network lives here.
 */
export async function resolveConnection(api, created) {
  const resolved = connectionUrls(created)
  if (!resolved.needsPassword) return resolved

  const branchId = created?.branch?.id
  if (!branchId)
    throw new Error('Neon create response carried no branch id to reveal a password on')
  const res = await api.revealPassword(branchId, resolved.role)
  const password = res.body?.password
  if (res.status !== 200 || !password) {
    throw new Error(`Neon reveal_password failed for role ${resolved.role} (${res.status})`)
  }
  const { host, poolerHost, database, role } = resolved
  return {
    direct: buildUrl({ host, database, role, password }),
    pooled: buildUrl({ host: poolerHost, database, role, password }),
    password,
  }
}

export async function resolveCiDatabase(api, { branchName, database = APP_DATABASE }) {
  if (!/^ci-\d+-\d+-int$/.test(branchName)) throw new Error('Expected an integration CI branch')
  if (database !== APP_DATABASE && !/^int_shard_[1-9]\d*$/.test(database)) {
    throw new Error('Expected an integration shard database')
  }
  const inventory = await api.listBranches()
  if (inventory.status !== 200) throw new Error(`Neon list branches failed (${inventory.status})`)
  const branch = inventory.body.branches?.find((b) => b.name === branchName)
  if (!branch?.parent_id || branch.default || branch.primary || branch.protected) {
    throw new Error('Integration CI branch missing or protected')
  }
  const databases = await api.listDatabases(branch.id)
  if (databases.status !== 200) throw new Error(`Neon list databases failed (${databases.status})`)
  const owner = databases.body.databases?.find((db) => db.name === database)?.owner_name
  if (!owner) throw new Error(`Database ${database} not found on integration CI branch`)
  const response = await api.connectionUri({ branchId: branch.id, database, role: owner })
  if (response.status !== 200 || !response.body.uri) {
    throw new Error(`Neon connection URI failed (${response.status})`)
  }
  const uri = new URL(response.body.uri)
  if (uri.pathname !== `/${database}` || uri.hostname.split('.')[0].endsWith('-pooler')) {
    throw new Error('Neon returned an unexpected direct database URI')
  }
  return {
    direct: uri.toString(),
    pooled: pooledUrl(uri.toString()),
    password: decodeURIComponent(uri.password),
  }
}

export async function cloneShardDatabases(
  api,
  { branchName, databases, connect, mask = () => {} },
) {
  if (
    !databases.length ||
    new Set(databases).size !== databases.length ||
    databases.some((name) => !/^int_shard_[1-9]\d*$/.test(name))
  ) {
    throw new Error('Expected unique integration shard database names')
  }
  const connection = await resolveCiDatabase(api, { branchName })
  mask(connection)
  const { direct } = connection
  // The source must have no open sessions while Postgres copies its template.
  const maintenance = new URL(direct)
  maintenance.pathname = '/postgres'
  connect ??= (await import('postgres')).default
  const sql = connect(maintenance.toString(), { max: 1, prepare: false })
  try {
    await sql`ALTER DATABASE ${sql(APP_DATABASE)} ALLOW_CONNECTIONS false`
    try {
      // Neon may retain idle connections after migration; this is CI-only.
      await sql`SELECT pg_terminate_backend(pid, 5000) FROM pg_stat_activity
        WHERE datname = ${APP_DATABASE} AND usename = current_user AND pid <> pg_backend_pid()`
      for (const database of databases) {
        await sql`CREATE DATABASE ${sql(database)} TEMPLATE ${sql(APP_DATABASE)}`
      }
    } finally {
      await sql`ALTER DATABASE ${sql(APP_DATABASE)} ALLOW_CONNECTIONS true`
    }
  } finally {
    await sql.end()
  }
}

function maskConnection({ direct, pooled, password }) {
  if (password) console.log(`::add-mask::${password}`)
  console.log(`::add-mask::${direct}`)
  console.log(`::add-mask::${pooled}`)
}

async function main(argv = process.argv, env = process.env) {
  const [command, branchName, ...databases] = argv.slice(2)
  if (
    !command ||
    !branchName ||
    !['create', 'delete', 'connect', 'clone-shards'].includes(command)
  ) {
    console.error(
      'usage: node scripts/neon-ci-branch.mjs <create|delete|connect|clone-shards> <branch-name> [databases...]',
    )
    return 2
  }

  const apiKey = env.NEON_API_KEY
  const projectId = env.NEON_PROJECT_ID
  const parentBranch = env.NEON_PARENT_BRANCH
  if (!apiKey || !projectId) {
    console.error('NEON_API_KEY and NEON_PROJECT_ID must be set')
    return 2
  }

  const api = makeNeonApi({ apiKey, projectId })

  if (command === 'delete') {
    await deleteByName(api, { branchName })
    return 0
  }

  if (command === 'clone-shards') {
    await cloneShardDatabases(api, { branchName, databases, mask: maskConnection })
    return 0
  }
  if (command === 'connect' && (databases.length !== 1 || !env.GITHUB_OUTPUT)) {
    console.error('connect requires one database and GITHUB_OUTPUT')
    return 2
  }
  if (command === 'create' && !parentBranch) {
    console.error('NEON_PARENT_BRANCH must be set for `create`')
    return 2
  }

  const { direct, pooled, password } =
    command === 'connect'
      ? await resolveCiDatabase(api, { branchName, database: databases[0] })
      : await resolveConnection(api, await createWithWait(api, { branchName, parentBranch }))

  // Mask the credential before anything else can echo it into the log.
  maskConnection({ direct, pooled, password })

  const out = env.GITHUB_OUTPUT
  if (out) {
    appendFileSync(out, `${outputLines({ direct, pooled }).join('\n')}\n`)
  } else {
    console.log(outputLines({ direct, pooled }).join('\n'))
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(await main())
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
