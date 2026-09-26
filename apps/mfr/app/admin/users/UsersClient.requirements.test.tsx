// @vitest-environment happy-dom
// Requirement coverage for CAP-005 User management
// (requirements/accounts/user-management.md): what the list shows and which
// buttons are available. The server actions are stubbed — their guards are
// covered in tests/integration/userManagement.test.ts.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { UserWithRoles } from '@/lib/users'

vi.mock('./actions', () => ({ setUserStatus: vi.fn(), setUserRole: vi.fn() }))

import { UsersClient } from './UsersClient'

afterEach(() => cleanup())

function user(over: Partial<UserWithRoles>): UserWithRoles {
  return {
    id: 'u-ann',
    email: 'ann@example.com',
    name: 'Ann Miller',
    status: 'approved',
    siteOwner: false,
    siteManager: false,
    accountingManager: false,
    ...over,
  }
}

/** The card for one user, found by their email address. */
function row(email: string) {
  const card = screen.getByText(email).closest('.card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

describe('CAP-005 User management', () => {
  it('CAP-005 · Everyone who has ever signed in is listed (name, email and status)', () => {
    const list = [
      user({ id: 'a', email: 'ann@example.com', name: 'Ann Miller', status: 'approved' }),
      user({ id: 'b', email: 'bob@example.com', name: 'Bob Miller', status: 'pending' }),
      user({ id: 'c', email: 'cat@example.com', name: 'Cat Miller', status: 'blocked' }),
    ]
    render(<UsersClient users={list} currentUserId="viewer" viewerIsOwner={false} />)

    for (const [email, name, status] of [
      ['ann@example.com', 'Ann Miller', 'approved'],
      ['bob@example.com', 'Bob Miller', 'pending'],
      ['cat@example.com', 'Cat Miller', 'blocked'],
    ]) {
      const r = row(email)
      expect(r.getByText(name)).toBeTruthy()
      expect(r.getByText(status, { exact: true })).toBeTruthy()
    }

    // Rendered in the order given (the server orders by email).
    const emails = screen.getAllByText(/@example\.com$/).map((el) => el.textContent)
    expect(emails).toEqual(['ann@example.com', 'bob@example.com', 'cat@example.com'])
  })

  it("CAP-005 · The current status's button is unavailable", () => {
    render(
      <UsersClient
        users={[
          user({ id: 'a', email: 'ann@example.com', status: 'approved' }),
          user({ id: 'b', email: 'bob@example.com', status: 'blocked' }),
        ]}
        currentUserId="viewer"
        viewerIsOwner={false}
      />,
    )

    const ann = row('ann@example.com')
    expect(ann.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
    expect(ann.getByRole('button', { name: 'Block' }).hasAttribute('disabled')).toBe(false)

    const bob = row('bob@example.com')
    expect(bob.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(false)
    expect(bob.getByRole('button', { name: 'Block' }).hasAttribute('disabled')).toBe(true)
  })

  it('CAP-005 · I cannot change my own status (both buttons unavailable on my row)', () => {
    render(
      <UsersClient
        users={[user({ id: 'me', email: 'me@example.com', status: 'approved', siteManager: true })]}
        currentUserId="me"
        viewerIsOwner={false}
      />,
    )

    const me = row('me@example.com')
    expect(me.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
    expect(me.getByRole('button', { name: 'Block' }).hasAttribute('disabled')).toBe(true)
  })

  it("CAP-005 · A site manager cannot change a site owner's status", () => {
    render(
      <UsersClient
        users={[
          user({ id: 'o', email: 'owner@example.com', status: 'approved', siteOwner: true }),
          user({ id: 'p', email: 'pat@example.com', status: 'pending' }),
        ]}
        currentUserId="manager"
        viewerIsOwner={false}
      />,
    )

    const owner = row('owner@example.com')
    expect(owner.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
    expect(owner.getByRole('button', { name: 'Block' }).hasAttribute('disabled')).toBe(true)
  })

  it('CAP-005 · Only a site owner sees and changes roles (a site manager sees no role buttons)', () => {
    const list = [user({ id: 'a', email: 'ann@example.com', siteManager: true })]

    render(<UsersClient users={list} currentUserId="viewer" viewerIsOwner={false} />)
    expect(screen.queryByText('Roles', { exact: true })).toBeNull()
    expect(screen.queryByRole('button', { name: /Site manager/ })).toBeNull()
    cleanup()

    render(<UsersClient users={list} currentUserId="viewer" viewerIsOwner />)
    const ann = row('ann@example.com')
    const granted = ann.getByRole('button', { name: '✓ Site manager' })
    expect(granted.getAttribute('aria-pressed')).toBe('true')
    expect(ann.getByRole('button', { name: 'Site owner' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('CAP-005 · An owner cannot give up their own owner role', () => {
    render(
      <UsersClient
        users={[
          user({ id: 'me', email: 'me@example.com', siteOwner: true }),
          user({ id: 'o2', email: 'other-owner@example.com', siteOwner: true }),
        ]}
        currentUserId="me"
        viewerIsOwner
      />,
    )

    const mine = row('me@example.com').getByRole('button', { name: '✓ Site owner' })
    expect(mine.hasAttribute('disabled')).toBe(true)
    // Only my own owner role is locked — another owner's can still be changed.
    const theirs = row('other-owner@example.com').getByRole('button', { name: '✓ Site owner' })
    expect(theirs.hasAttribute('disabled')).toBe(false)
  })

  it('CAP-005 · No accounts yet', () => {
    render(<UsersClient users={[]} currentUserId="viewer" viewerIsOwner />)

    expect(screen.getByText('No users yet.')).toBeTruthy()
  })
})
