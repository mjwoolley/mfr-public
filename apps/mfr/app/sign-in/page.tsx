import Image from 'next/image'
import { redirect } from 'next/navigation'
import { auth, signIn } from '@/lib/auth'

// The portal is the one sign-in surface for all three apps. Accounting and
// reservations redirect signed-out users here with `?callbackUrl=<their URL>`;
// after Google sign-in we send the user back there. @mfr/auth's redirect
// callback validates the target (same registrable domain), so an off-domain
// callbackUrl safely falls back to the portal home.
// Auth.js redirects sign-in failures here (pages.signIn AND pages.error both
// point at this page): kind-"signIn" errors keep their code, everything
// non-client-safe is collapsed to "Configuration" by @auth/core.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    'This email address is already registered here. Try signing in again with the same Google account you used before; if this keeps happening, contact the site owner.',
  AccessDenied: 'Sign-in was cancelled or not allowed. Please try again.',
  Configuration:
    'Something is wrong on our end and sign-in cannot complete right now. Please contact the site owner.',
  OAuthCallbackError: 'Something went wrong while talking to Google. Please try again.',
  Verification: 'That sign-in link is no longer valid. Please sign in again.',
  Default:
    'Something went wrong while signing you in. Please try again; if it keeps happening, contact the site owner.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const { callbackUrl, error } = await searchParams
  const target = callbackUrl || '/'

  const session = await auth()
  if (session?.user) redirect(target)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div>
        <h1 className="text-3xl">Miller Family Reunions</h1>
        <p className="text-muted mt-2">Sign in to access the family portal.</p>
      </div>
      {error && (
        <div
          role="alert"
          className="max-w-sm px-4 py-3 text-left text-sm leading-relaxed"
          style={{
            border: '1px solid var(--color-accent-300)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent-100)',
            color: 'var(--color-accent-800)',
          }}
        >
          <p>{AUTH_ERROR_MESSAGES[error] ?? AUTH_ERROR_MESSAGES.Default}</p>
          {/* The raw code makes a family member's screenshot diagnosable. */}
          <p className="mt-1 text-xs" style={{ color: 'var(--color-accent-700)' }}>
            Error code: {error}
          </p>
        </div>
      )}
      <div className="flex max-w-sm flex-col items-center gap-4">
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: target })
          }}
        >
          <button
            type="submit"
            className="btn btn-primary inline-flex items-center gap-3 px-6 py-3"
          >
            <GoogleGlyph />
            Sign in with Google
          </button>
        </form>
        <p className="text-muted text-[13px] leading-relaxed">
          You must have a Google account to sign in to this website.{' '}
          <a
            href="https://accounts.google.com/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-[3px]"
            style={{ color: 'var(--color-accent)' }}
          >
            Click here
          </a>{' '}
          to register for a Google account. You do not have to use Gmail as your email service to
          sign up for a Google account.
        </p>
        <a
          href="/google-signup-existing-email.jpg"
          target="_blank"
          rel="noopener noreferrer"
          title="Open full-size screenshot"
        >
          <Image
            src="/google-signup-existing-email.jpg"
            alt="Google's sign-up screen, with an arrow pointing to the 'Use your existing email' link"
            width={360}
            height={155}
            className="max-w-full"
            style={{
              border: '1px solid var(--color-divider)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-sm)',
            }}
          />
        </a>
        <p className="text-muted text-[13px] leading-relaxed">
          When registering, choose &ldquo;Use your existing email&rdquo; (arrow above) to sign up
          with the email address you already have.
        </p>
      </div>
    </div>
  )
}

// The multicolor Google "G" mark, drawn inline so the button needs no image asset.
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}
