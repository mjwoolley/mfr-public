import { auth } from '@/lib/auth'
import { listApprovedMembers } from '@/lib/users'
import { AdminReservationsClient } from './AdminReservationsClient'

export default async function AdminReservationsPage() {
  const session = await auth()
  // admin layouts already guarantee a reservations-admin session here.
  const members = await listApprovedMembers()
  return <AdminReservationsClient adminUserId={session!.user.id} members={members} />
}
