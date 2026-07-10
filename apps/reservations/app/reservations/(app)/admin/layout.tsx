import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // app/(app)/layout.tsx (the parent layout) already guarantees an
  // approved session reaches this point. This gate is deliberately relaxed
  // to either admin type — reservations-admin OR accounting-admin — because
  // the shared Users approval queue (admin/users) lives directly under this
  // layout and both admin types need to reach it. The reservations-specific
  // sections (blocked-dates, booking-rules, reservations) live under the
  // nested (reservations-admin) route group, which applies its own
  // additional, tighter isReservationsAdmin-only gate on top of this one.
  // Every /api/admin/* route still independently enforces its own
  // server-side check regardless of what this UI-level gate does.
  if (!session?.user?.isReservationsAdmin && !session?.user?.isAccountingAdmin) {
    redirect('/reservations/calendar')
  }

  return <>{children}</>
}
