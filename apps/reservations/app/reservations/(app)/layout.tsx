import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'
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
      <NavBar isAdmin={session.user.isReservationsAdmin || session.user.isAccountingAdmin} />
      {children}
    </>
  )
}
