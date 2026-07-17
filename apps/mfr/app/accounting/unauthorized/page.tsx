import { auth } from '@/lib/auth'

export default async function UnauthorizedPage() {
  const session = await auth()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-3xl">Not authorized</h1>
      <p className="max-w-md text-muted">
        {session?.user?.email ? (
          <>
            <span className="font-mono">{session.user.email}</span> isn&apos;t set up as a
            shareholder yet.
          </>
        ) : (
          'You need to sign in.'
        )}{' '}
        Contact the corporation administrator to be added.
      </p>
    </div>
  )
}
