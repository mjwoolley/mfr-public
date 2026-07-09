import { signIn } from '@/lib/auth/config'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">Family Cabin Reservations</h1>
      <p className="text-gray-600">Sign in with your Google account to request access.</p>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/' })
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  )
}
