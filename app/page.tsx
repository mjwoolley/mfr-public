import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'

export default async function RootPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.status === 'pending') {
    redirect('/pending')
  }

  if (session.user.status === 'blocked') {
    redirect('/blocked')
  }

  // Approved users land here; the calendar page (Milestone 5) will replace
  // this redirect target. Until then this 404s for approved users, which is
  // expected mid-project — Milestone 5 fills in the destination.
  redirect('/calendar')
}
