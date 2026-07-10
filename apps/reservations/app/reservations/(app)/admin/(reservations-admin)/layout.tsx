import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'

export default async function ReservationsAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // The parent admin/layout.tsx already guarantees the visitor is a portal
  // admin of some kind (reservations or accounting). This route group adds
  // the additional, tighter restriction that the sections nested under it
  // (blocked-dates, booking-rules, reservations) are reservations-admin
  // only — an accounting-only admin reaches admin/users (outside this
  // group) but gets redirected away from these.
  if (!session?.user?.isReservationsAdmin) {
    redirect('/reservations/admin')
  }

  return <>{children}</>
}
