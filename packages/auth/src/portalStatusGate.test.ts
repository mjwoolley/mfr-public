import { describe, it, expect } from 'vitest'
import type { Session } from 'next-auth'
import { createPortalStatusGate } from './portalStatusGate'

const gate = createPortalStatusGate({
  loginPath: '/app/login',
  pendingPath: '/app/pending',
  blockedPath: '/app/blocked',
})

function sessionWithStatus(status: 'pending' | 'approved' | 'blocked'): Session {
  return {
    user: { status },
    expires: new Date().toISOString(),
  } as Session
}

// next/navigation's redirect() throws an error whose `.message` is just
// "NEXT_REDIRECT" — the actual destination is encoded on `.digest` instead,
// as `NEXT_REDIRECT;<type>;<path>;<statusCode>;`. See
// https://nextjs.org/docs/app/api-reference/functions/redirect.
function expectRedirectTo(fn: () => unknown, path: string) {
  try {
    fn()
    expect.fail('expected function to call redirect() and throw')
  } catch (err) {
    const digest = (err as { digest?: string }).digest
    expect(digest).toMatch(new RegExp(`^NEXT_REDIRECT;.*;${path};`))
  }
}

describe('createPortalStatusGate', () => {
  it('redirects to loginPath when there is no session', () => {
    expectRedirectTo(() => gate(null), '/app/login')
  })

  it('redirects to loginPath when the session has no user', () => {
    expectRedirectTo(() => gate({ user: undefined, expires: '' } as unknown as Session), '/app/login')
  })

  it('redirects to pendingPath when status is pending', () => {
    expectRedirectTo(() => gate(sessionWithStatus('pending')), '/app/pending')
  })

  it('redirects to blockedPath when status is blocked', () => {
    expectRedirectTo(() => gate(sessionWithStatus('blocked')), '/app/blocked')
  })

  it('returns the session unchanged when status is approved', () => {
    const session = sessionWithStatus('approved')
    expect(gate(session)).toBe(session)
  })
})
