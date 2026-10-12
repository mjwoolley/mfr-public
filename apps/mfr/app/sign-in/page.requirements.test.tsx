// Requirement coverage for CAP-001 Sign in with Google
// (requirements/accounts/sign-in-with-google.md): the sign-in page's copy, the
// return-link hand-off to Auth.js, and every failed-sign-in message.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

const { authMock, signInMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  signInMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock, signIn: signInMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import SignInPage from './page'
import { RESERVATIONS_SIGN_IN_URL } from '@/lib/reservations/auth/portalStatusGate'
import { ACCOUNTING_SIGN_IN_URL } from '@/lib/accounting/authz'

const props = (callbackUrl?: string, error?: string) => ({
  searchParams: Promise.resolve({ callbackUrl, error }),
})

/** Depth-first search of a React element tree for the first element matching `pred`. */
function findElement(node: ReactNode, pred: (el: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, pred)
      if (hit) return hit
    }
    return null
  }
  if (!isValidElement(node)) return null
  if (pred(node)) return node
  return findElement((node.props as { children?: ReactNode }).children, pred)
}

/** Submits the "Sign in with Google" form the way the browser would (runs its server action). */
async function submitGoogleForm(tree: ReactElement) {
  const form = findElement(tree, (el) => el.type === 'form')
  expect(form).not.toBeNull()
  const action = (form!.props as { action: () => Promise<void> }).action
  await action()
}

/** The callbackUrl a section's gate sends a signed-out visitor to sign in with. */
const callbackOf = (signInUrl: string) =>
  new URL(signInUrl, 'https://example.test').searchParams.get('callbackUrl') ?? undefined

beforeEach(() => {
  authMock.mockReset()
  signInMock.mockReset()
  redirectMock.mockClear()
})

describe('CAP-001 Sign in with Google', () => {
  it('CAP-001 · Google is the only way to sign in', async () => {
    authMock.mockResolvedValue(null)

    const tree = await SignInPage(props())
    const html = renderToStaticMarkup(tree)

    expect(html).toContain('Sign in to access the family portal.')
    expect(html).toContain('You must have a Google account to sign in to this website.')
    // A single sign-in button, and it is the Google one.
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html.match(/<form/g)).toHaveLength(1)
    expect(html).toContain('Sign in with Google')

    await submitGoogleForm(tree)
    expect(signInMock).toHaveBeenCalledTimes(1)
    expect(signInMock.mock.calls[0][0]).toBe('google')
  })

  describe('CAP-001 · A signed-out visit to a section returns me there after sign-in', () => {
    it.each([
      ['Reservations', RESERVATIONS_SIGN_IN_URL, '/reservations'],
      ['Accounting', ACCOUNTING_SIGN_IN_URL, '/accounting'],
    ])(
      'CAP-001 · %s: the sign-in link carries the section and hands it to Google sign-in',
      async (_section, signInUrl, sectionPath) => {
        // The section's gate asks the visitor to sign in with its own path as the return link…
        expect(signInUrl.startsWith('/sign-in?')).toBe(true)
        const callbackUrl = callbackOf(signInUrl)
        expect(callbackUrl).toBe(sectionPath)

        // …and the sign-in form sends that return link to Auth.js as the post-sign-in target.
        authMock.mockResolvedValue(null)
        await submitGoogleForm(await SignInPage(props(callbackUrl)))
        expect(signInMock).toHaveBeenCalledWith('google', { redirectTo: sectionPath })
      },
    )
  })

  describe('CAP-001 · A failed sign-in explains what went wrong', () => {
    it.each([
      [
        'OAuthAccountNotLinked',
        'This email address is already registered here. Try signing in again with the same Google account you used before; if this keeps happening, contact the site owner.',
      ],
      ['AccessDenied', 'Sign-in was cancelled or not allowed. Please try again.'],
      [
        'Configuration',
        'Something is wrong on our end and sign-in cannot complete right now. Please contact the site owner.',
      ],
      ['OAuthCallbackError', 'Something went wrong while talking to Google. Please try again.'],
      ['Verification', 'That sign-in link is no longer valid. Please sign in again.'],
      [
        'SomethingUnrecognised',
        'Something went wrong while signing you in. Please try again; if it keeps happening, contact the site owner.',
      ],
    ])('CAP-001 · error %s shows its message, the code and a retry', async (code, message) => {
      authMock.mockResolvedValue(null)

      const html = renderToStaticMarkup(await SignInPage(props(undefined, code)))
      // Static markup escapes apostrophes; compare against the decoded text.
      const text = html.replace(/&#x27;/g, "'")

      expect(text).toContain(message)
      expect(text).toContain(`Error code: ${code}`)
      expect(text).toContain('Sign in with Google')
    })
  })
})
