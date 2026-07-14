import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthStatus } from './AuthStatus'

describe('AuthStatus', () => {
  it('renders the signed-in email', () => {
    const html = renderToStaticMarkup(
      <AuthStatus email="alice@example.com" onSignOut={async () => {}} />,
    )

    expect(html).toContain('alice@example.com')
  })

  it('renders a sign-out form that submits via the given action', () => {
    const html = renderToStaticMarkup(
      <AuthStatus email="alice@example.com" onSignOut={async () => {}} />,
    )

    expect(html).toContain('<form')
    expect(html).toContain('Sign out')
    expect(html).toMatch(/<button[^>]*type="submit"/)
  })

  it('reflects a different email when given different props', () => {
    const html = renderToStaticMarkup(
      <AuthStatus email="bob@example.com" onSignOut={async () => {}} />,
    )

    expect(html).toContain('bob@example.com')
    expect(html).not.toContain('alice@example.com')
  })
})
