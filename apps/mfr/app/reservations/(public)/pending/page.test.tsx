import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import PendingPage from './page'

// Mirrors app/accounting/pending/page.test.tsx — same static-page bug, same fix.
describe('reservations pending page', () => {
  beforeEach(() => {
    authMock.mockReset()
    redirectMock.mockClear()
  })

  const session = (status: 'pending' | 'approved' | 'blocked') => ({
    user: { id: 'u1', email: 'member@example.com', status },
    expires: '2099-01-01',
  })

  it('lets a just-approved user straight into reservations on a refresh', async () => {
    authMock.mockResolvedValue(session('approved'))

    await expect(PendingPage()).rejects.toThrow('NEXT_REDIRECT:/reservations')
    expect(redirectMock).toHaveBeenCalledWith('/reservations')
  })

  it('sends a blocked user to the blocked page', async () => {
    authMock.mockResolvedValue(session('blocked'))

    await expect(PendingPage()).rejects.toThrow('NEXT_REDIRECT:/reservations/blocked')
  })

  it('sends a signed-out visitor to sign in', async () => {
    authMock.mockResolvedValue(null)

    await expect(PendingPage()).rejects.toThrow(/NEXT_REDIRECT:\/sign-in/)
  })

  it('renders the waiting message and a Check again link for a still-pending user', async () => {
    authMock.mockResolvedValue(session('pending'))

    const html = renderToStaticMarkup(await PendingPage())

    expect(html).toContain('Your access is pending approval')
    expect(html).toContain('Check again')
    expect(html).toContain('href="/reservations/pending"')
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
