import { auth } from '@/lib/reservations/auth/config'
import { CalendarClient } from './CalendarClient'

export default async function CalendarPage() {
  const session = await auth()
  // (app)/layout.tsx already guarantees an approved session reaches this
  // point; the non-null assertion reflects that guarantee, not a new check.
  return <CalendarClient userId={session!.user.id} />
}
