import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { gatePortalStatus } from '@/lib/reservations/auth/portalStatusGate'

export default async function RootPage() {
  gatePortalStatus(await auth())

  redirect('/reservations/calendar')
}
