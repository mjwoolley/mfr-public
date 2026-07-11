import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'

/**
 * The Admin landing simply forwards to the first section the visitor can
 * use — the seg sub-nav in the layout is the real navigation.
 */
export default async function AdminIndexPage() {
  const session = await auth()
  if (session?.user?.isReservationsAdmin) {
    redirect('/reservations/admin/reservations')
  }
  redirect('/reservations/admin/users')
}
