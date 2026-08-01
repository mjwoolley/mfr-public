import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ACCOUNTING_SIGN_IN_URL } from '@/lib/accounting/authz'

// This page re-checks status and forwards an approved user on. It used to
// render the "pending" message unconditionally, so someone waiting here could
// refresh all day and still see it — approval only appeared to take effect
// after a sign-out/sign-in, because that round trip landed them back at
// /accounting rather than here. Nothing was ever stale: sessions are Auth.js
// *database* sessions, so status is re-read from Postgres on every request.
// The page simply never acted on it.
export default async function PendingPage() {
  const session = await auth()
  if (!session?.user) redirect(ACCOUNTING_SIGN_IN_URL)
  if (session.user.status === 'approved') redirect('/accounting')
  if (session.user.status === 'blocked') redirect('/accounting/blocked')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-3xl">Your access is pending approval</h1>
      <p className="text-muted max-w-md">
        An admin needs to approve your account before you can use the family portal. You&apos;ll be
        notified by email once you&apos;re approved.
      </p>
      {/* A plain anchor, not next/link: this is a "reload and re-check my
          status" button, and a full document request is exactly what makes the
          redirect above fire the instant an admin approves them. */}
      <a href="/accounting/pending" className="btn btn-secondary no-underline">
        Check again
      </a>
    </div>
  )
}
