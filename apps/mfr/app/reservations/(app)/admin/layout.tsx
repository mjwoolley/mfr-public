import { redirect } from 'next/navigation'
import { canAdminReservations } from '@mfr/auth'
import { auth } from '@/lib/auth'
import { AdminSubNav } from './AdminSubNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // app/(app)/layout.tsx (the parent layout) already guarantees an approved
  // session reaches this point. The reservations Admin area is now
  // reservations-admin only (site owner or site manager) — user management
  // moved to the portal app, so accounting-only admins no longer have anything
  // to do here. Every /api/admin/* route still independently enforces its own
  // server-side check regardless of what this UI-level gate does.
  if (!session?.user || !canAdminReservations(session.user.roles)) {
    redirect('/reservations/calendar')
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-7 pb-16 sm:px-7">
      <h1 className="mb-4 text-4xl">Admin</h1>
      <AdminSubNav />
      {children}
    </div>
  )
}
