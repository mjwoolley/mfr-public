import { canAdminReservations } from '@mfr/auth'
import { auth } from '@/lib/auth'
import { MyReservationsClient } from './MyReservationsClient'

export default async function MyReservationsPage() {
  const session = await auth()
  return (
    <MyReservationsClient
      userId={session!.user.id}
      isAdmin={canAdminReservations(session!.user.roles)}
    />
  )
}
