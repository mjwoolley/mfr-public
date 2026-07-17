// getFundraising's fetch behavior — mocked network, no database. The DB
// singletons are mocked because importing @/lib/portal pulls them in, and
// they throw at module load when their env vars are unset (unit runs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identityDb', () => ({ identityDb: {} }))
vi.mock('@/lib/portalDb', () => ({ portalDb: {} }))

import { getFundraising } from '@/lib/portal'
import { ACCOUNTING_URL } from '@mfr/ui'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('getFundraising', () => {
  it('fetches the live totals from accounting with ISR revalidation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ year: 2026, raised: 1234, goal: 5000 }),
    })

    const result = await getFundraising()

    expect(result).toEqual({ year: 2026, raised: 1234, goal: 5000 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${ACCOUNTING_URL}/api/contributions/current-year`)
    expect(init.next).toEqual({ revalidate: 60 })
    // production: no bypass secret, no protection header
    expect(init.headers).toBeUndefined()
  })

  it('sends the Vercel protection bypass header when the secret is set (staging)', async () => {
    vi.stubEnv('ACCOUNTING_BYPASS_SECRET', 'bypass-me')
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ year: 2026, raised: 0, goal: null }),
    })

    await getFundraising()

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toEqual({ 'x-vercel-protection-bypass': 'bypass-me' })
  })

  it('degrades to null on a non-OK response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    expect(await getFundraising()).toBeNull()
  })

  it('degrades to null when accounting is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await getFundraising()).toBeNull()
  })
})
