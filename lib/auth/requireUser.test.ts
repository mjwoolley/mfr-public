import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireUser } from './requireUser'
import { requireApprovedUser } from './requireApprovedUser'
import { requireAdmin } from './requireAdmin'

vi.mock('./config', () => ({
  auth: vi.fn(),
}))

import { auth } from './config'

function mockSession(status: 'pending' | 'approved' | 'blocked', isAdmin: boolean) {
  return {
    user: { id: 'user-1', status, isAdmin, email: 'test@example.com' },
    expires: '2099-01-01',
  }
}

describe('requireUser', () => {
  beforeEach(() => vi.mocked(auth).mockReset())

  it('returns ok:false with a 401 response when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    const result = await requireUser()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns ok:true with the session when authenticated', async () => {
    const session = mockSession('approved', false)
    vi.mocked(auth).mockResolvedValue(session as never)
    const result = await requireUser()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.session.user.id).toBe('user-1')
  })
})

describe('requireApprovedUser', () => {
  beforeEach(() => vi.mocked(auth).mockReset())

  it('returns 401 when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    const result = await requireApprovedUser()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns 403 when the user is pending', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession('pending', false) as never)
    const result = await requireApprovedUser()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('returns 403 when the user is blocked', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession('blocked', false) as never)
    const result = await requireApprovedUser()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('returns ok:true when the user is approved', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession('approved', false) as never)
    const result = await requireApprovedUser()
    expect(result.ok).toBe(true)
  })
})

describe('requireAdmin', () => {
  beforeEach(() => vi.mocked(auth).mockReset())

  it('returns 403 when the user is approved but not an admin', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession('approved', false) as never)
    const result = await requireAdmin()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('returns 403 when the user is pending, even if isAdmin is true', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession('pending', true) as never)
    const result = await requireAdmin()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('returns ok:true when the user is approved and an admin', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession('approved', true) as never)
    const result = await requireAdmin()
    expect(result.ok).toBe(true)
  })
})
