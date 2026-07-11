import { signIn } from '@/lib/auth/config'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl">Family Cabin Reservations</h1>
      <p className="text-muted">Sign in with your Google account to request access.</p>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/reservations' })
        }}
      >
        <button type="submit" className="btn btn-primary px-5 py-3">
          Sign in with Google
        </button>
      </form>
    </main>
  )
}
