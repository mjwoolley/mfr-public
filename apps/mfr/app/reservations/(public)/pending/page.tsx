import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { RESERVATIONS_SIGN_IN_URL } from '@/lib/reservations/auth/portalStatusGate'

// Re-checks status and forwards an approved member on — see the note in
// app/accounting/pending/page.tsx for why refreshing used to look like it did
// nothing.
export default async function PendingPage() {
  const session = await auth()
  if (!session?.user) redirect(RESERVATIONS_SIGN_IN_URL)
  if (session.user.status === 'approved') redirect('/reservations')
  if (session.user.status === 'blocked') redirect('/reservations/blocked')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl">Your access is pending approval</h1>
      <p className="text-muted max-w-md">
        An admin needs to approve your account before you can view or book the cabin calendar.
        You&apos;ll be notified by email once you&apos;re approved.
      </p>
      {/* Plain anchor, not next/link — a full document request is what re-runs
          the status check above. */}
      <a href="/reservations/pending" className="btn btn-secondary no-underline">
        Check again
      </a>
    </main>
  )
}
