// @vitest-environment happy-dom
// Requirement tests for the reservations tab row (CAP-022 tabs, CAP-025 Admin
// tab visibility).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/reservations/calendar' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { NavBar } from './NavBar'

afterEach(() => cleanup())

function tabs() {
  return screen.getAllByRole('link').map((a) => a.textContent)
}

describe('CAP-022 Cabin calendar — reservations tabs', () => {
  it('CAP-022 · Reservations open on the calendar for the current month (tabs Calendar, My Reservations, Reservations Summary)', () => {
    render(<NavBar isAdmin={false} />)
    expect(tabs()).toEqual(['Calendar', 'My Reservations', 'Reservations Summary'])
    expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('aria-current')).toBe('page')
  })
})

describe('CAP-025 Manage all reservations — Admin tab', () => {
  it('CAP-025 · Reservations admins get an Admin tab (marked as admins only)', () => {
    render(<NavBar isAdmin />)
    expect(tabs()).toEqual(['Calendar', 'My Reservations', 'Reservations Summary', 'Admin'])
    const admin = screen.getByRole('link', { name: /Admin/ })
    expect(admin.getAttribute('href')).toBe('/reservations/admin')
    expect(admin.querySelector('[aria-label="Admins only"]')).not.toBeNull()
  })

  it('CAP-025 · Members without an admin role cannot reach the Admin area (no Admin tab)', () => {
    render(<NavBar isAdmin={false} />)
    expect(screen.queryByRole('link', { name: /Admin/ })).toBeNull()
  })
})
