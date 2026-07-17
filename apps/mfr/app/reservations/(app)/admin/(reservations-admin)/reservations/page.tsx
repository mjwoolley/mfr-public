import { auth } from '@/lib/auth'
import { AdminReservationsClient } from './AdminReservationsClient'

export default async function AdminReservationsPage() {
  const session = await auth()
  // admin layouts already guarantee a reservations-admin session here.
  return <AdminReservationsClient adminUserId={session!.user.id} />
}
