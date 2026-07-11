import { redirect } from 'next/navigation'
import { PortalHeader, AuthStatus } from '@mfr/ui'
import { auth, signOut } from '@/lib/auth/config'
import { NavBar } from './NavBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/reservations/login')
  }

  if (session.user.status === 'pending') {
    redirect('/reservations/pending')
  }

  if (session.user.status === 'blocked') {
    redirect('/reservations/blocked')
  }

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
      <NavBar isAdmin={session.user.isReservationsAdmin || session.user.isAccountingAdmin} />
      {children}
    </>
  )
}
