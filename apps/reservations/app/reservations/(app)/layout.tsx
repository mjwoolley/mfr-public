import { PortalHeader, AuthStatus } from '@mfr/ui'
import { canAdminReservations } from '@mfr/auth'
import { auth, signOut } from '@/lib/auth/config'
import { gatePortalStatus } from '@/lib/auth/portalStatusGate'
import { NavBar } from './NavBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = gatePortalStatus(await auth())

  return (
    <>
      <PortalHeader appName="Reservations" appHref="/reservations/calendar">
        <AuthStatus
          email={session.user.email ?? ''}
          onSignOut={async () => {
            'use server'
            await signOut({ redirectTo: '/reservations/login' })
          }}
        />
      </PortalHeader>
      <NavBar isAdmin={canAdminReservations(session.user.roles)} />
      {children}
    </>
  )
}
