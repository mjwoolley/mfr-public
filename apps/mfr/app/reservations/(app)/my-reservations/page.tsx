import { auth } from '@/lib/reservations/auth/config'
import { MyReservationsClient } from './MyReservationsClient'

export default async function MyReservationsPage() {
  const session = await auth()
  return <MyReservationsClient userId={session!.user.id} />
}
