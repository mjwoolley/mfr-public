import { signIn } from '@/lib/auth/config'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-display text-2xl font-semibold text-stone-900">Family Cabin Reservations</h1>
      <p className="text-stone-600">Sign in with your Google account to request access.</p>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/reservations' })
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-lake-600 px-4 py-2 font-medium text-white hover:bg-lake-700"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  )
}
