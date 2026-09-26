// @vitest-environment happy-dom
// Requirement tests for the reservations Admin area gate and sub-nav
// (CAP-025): the real admin layout (a server component, called directly) with
// the session and Next's redirect mocked.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/reservations/admin/reservations',
  // Next's redirect() throws to abort rendering; mirror that.
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminLayout from './layout'
import AdminIndexPage from './page'

afterEach(() => {
  cleanup()
  vi.mocked(auth).mockReset()
  vi.mocked(redirect).mockClear()
})

function sessionWith(roles: { siteOwner?: boolean; siteManager?: boolean }) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: 'u1',
      status: 'approved',
      roles: {
        siteOwner: roles.siteOwner ?? false,
        siteManager: roles.siteManager ?? false,
        accountingManager: false,
      },
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

describe('CAP-025 Manage all reservations — Admin area', () => {
  it('CAP-025 · Reservations admins get an Admin tab (the Admin area lists All Reservations first, then Blocked Dates and Booking Rules)', async () => {
    sessionWith({ siteManager: true })
    render(await AdminLayout({ children: <p>child</p> }))

    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toBeTruthy()
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'All Reservations',
      'Blocked Dates',
      'Booking Rules',
    ])
    expect(redirect).not.toHaveBeenCalled()
    // Opening "Admin" lands on the first section.
    await expect(AdminIndexPage()).rejects.toThrow('NEXT_REDIRECT /reservations/admin/reservations')
  })

  it('CAP-025 · Members without an admin role cannot reach the Admin area (taken to the cabin calendar)', async () => {
    sessionWith({})
    await expect(AdminLayout({ children: <p>child</p> })).rejects.toThrow(
      'NEXT_REDIRECT /reservations/calendar',
    )
    expect(redirect).toHaveBeenCalledWith('/reservations/calendar')
  })
})
