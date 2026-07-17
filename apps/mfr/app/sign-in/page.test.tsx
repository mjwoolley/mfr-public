import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// next/image needs the Next.js runtime image config; render a plain img.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth', () => ({
  auth: authMock,
  signIn: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

import SignInPage from './page'

describe('sign-in page', () => {
  beforeEach(() => {
    authMock.mockReset()
    redirectMock.mockClear()
  })

  const props = (callbackUrl?: string) => ({ searchParams: Promise.resolve({ callbackUrl }) })

  it('renders the Google sign-in form when signed out', async () => {
    authMock.mockResolvedValue(null)

    const html = renderToStaticMarkup(await SignInPage(props()))

    expect(html).toContain('Miller Family Reunions')
    expect(html).toContain('Sign in with Google')
    expect(html).toMatch(/<button[^>]*type="submit"/)
  })

  it('shows the Google-account note with the existing-email screenshot', async () => {
    authMock.mockResolvedValue(null)

    const html = renderToStaticMarkup(await SignInPage(props()))

    expect(html).toContain('https://accounts.google.com/signup')
    expect(html).toContain('/google-signup-existing-email.jpg')
    expect(html).toContain('Use your existing email')
  })

  it('redirects home when already signed in', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'alice@example.com' } })

    await expect(SignInPage(props())).rejects.toThrow('NEXT_REDIRECT:/')
    expect(redirectMock).toHaveBeenCalledWith('/')
  })

  it('redirects an already-signed-in user to the callbackUrl when present', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'alice@example.com' } })

    const target = 'https://accounting.millerfamilyreunions.org/accounting'
    await expect(SignInPage(props(target))).rejects.toThrow(`NEXT_REDIRECT:${target}`)
    expect(redirectMock).toHaveBeenCalledWith(target)
  })
})
