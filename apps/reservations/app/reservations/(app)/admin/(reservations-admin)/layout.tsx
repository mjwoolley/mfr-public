import { redirect } from 'next/navigation'
import { canAdminReservations } from '@mfr/auth'
import { auth } from '@/lib/auth/config'

export default async function ReservationsAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // Redundant with the parent admin/layout.tsx now that user management moved
  // to the portal (the parent already gates the whole area to reservations
  // admins), but kept as defense-in-depth for the sections nested here
  // (blocked-dates, booking-rules, reservations).
  if (!session?.user || !canAdminReservations(session.user.roles)) {
    redirect('/reservations/admin')
  }

  return <>{children}</>
}
