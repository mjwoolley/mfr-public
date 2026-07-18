// Integration: the /api/health route. DB check runs against the real test branch
// (tables present → passes); the R2 probe is mocked. Covers auth + pass/fail.

import { it, expect, beforeEach, afterEach, vi } from 'vitest'

const healthCheckR2 = vi.fn()
vi.mock('../../lib/photos/backupStore', () => ({
  healthCheckR2: (...a: unknown[]) => healthCheckR2(...a),
}))

import { GET } from '../../app/api/health/route'

const SECRET = 'test-health-secret'
const req = (auth?: string) =>
  new Request('https://x/api/health', { headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  healthCheckR2.mockReset()
})
afterEach(() => {
  delete process.env.CRON_SECRET
})

it('rejects a missing/wrong secret with 401', async () => {
  expect((await GET(req())).status).toBe(401)
  expect((await GET(req('Bearer nope'))).status).toBe(401)
  expect(healthCheckR2).not.toHaveBeenCalled()
})

it('returns 200 { ok: true } when DB and R2 are healthy', async () => {
  healthCheckR2.mockResolvedValue({ ok: true })
  const res = await GET(req(`Bearer ${SECRET}`))
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body).toMatchObject({ ok: true, checks: { db: true, r2: true } })
})

it('returns 503 when the R2 probe fails', async () => {
  healthCheckR2.mockResolvedValue({ ok: false, detail: 'bad creds' })
  const res = await GET(req(`Bearer ${SECRET}`))
  const body = await res.json()
  expect(res.status).toBe(503)
  expect(body.ok).toBe(false)
  expect(body.checks.r2).toBe(false)
})
