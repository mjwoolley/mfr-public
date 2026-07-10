import { redirect } from 'next/navigation'
import { PortalHeader } from '@mfr/ui'
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
        <span className="hidden text-sm text-lake-200 sm:inline">{session.user.email}</span>
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/reservations/login' })
          }}
        >
          <button
            type="submit"
            className="text-sm text-lake-100 underline transition-colors hover:text-sand-50"
          >
            Sign out
          </button>
        </form>
      </PortalHeader>
      <NavBar isAdmin={session.user.isReservationsAdmin || session.user.isAccountingAdmin} />
      {children}
    </>
  )
}
