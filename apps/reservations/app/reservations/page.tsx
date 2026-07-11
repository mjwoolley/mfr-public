import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'
import { gatePortalStatus } from '@/lib/auth/portalStatusGate'

export default async function RootPage() {
  gatePortalStatus(await auth())

  redirect('/reservations/calendar')
}
