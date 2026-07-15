import { redirect } from 'next/navigation'
import { auth, signIn } from '@/lib/auth'

// The portal is the one sign-in surface for all three apps. Accounting and
// reservations redirect signed-out users here with `?callbackUrl=<their URL>`;
// after Google sign-in we send the user back there. @mfr/auth's redirect
// callback validates the target (same registrable domain), so an off-domain
// callbackUrl safely falls back to the portal home.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const target = callbackUrl || '/'

  const session = await auth()
  if (session?.user) redirect(target)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div>
        <h1 className="text-3xl">Miller Family Reunions</h1>
        <p className="text-muted mt-2">Sign in to access the family portal.</p>
      </div>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: target })
        }}
      >
        <button type="submit" className="btn btn-primary px-6 py-3">
          Sign in with Google
        </button>
      </form>
    </div>
  )
}
