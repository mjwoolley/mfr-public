import { canAdminReservations } from '@mfr/auth'
import { auth } from '@/lib/auth'
import { gatePortalStatus } from '@/lib/reservations/auth/portalStatusGate'
import { NavBar } from './NavBar'

// The unified app's root layout renders the primary nav + header. This section
// layout only gates portal status and renders the reservations second-level
// sub-tab row (NavBar).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = gatePortalStatus(await auth())

  return (
    <>
      <NavBar isAdmin={canAdminReservations(session.user.roles)} />
      {children}
    </>
  )
}
