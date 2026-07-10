import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'

export default async function RootPage() {
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

  redirect('/reservations/calendar')
}
