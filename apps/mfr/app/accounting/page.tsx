import { redirect } from 'next/navigation'
import { canAdminAccounting } from '@mfr/auth'
import { auth } from '@/lib/auth'
import { ACCOUNTING_SIGN_IN_URL } from '@/lib/accounting/authz'

export default async function Home() {
  const session = await auth()
  if (!session?.user) redirect(ACCOUNTING_SIGN_IN_URL)
  if (session.user.status === 'blocked') redirect('/accounting/blocked')
  if (session.user.status !== 'approved') redirect('/accounting/pending')
  if (canAdminAccounting(session.user.roles)) redirect('/accounting/activity')
  if (session.user.shareholderId) redirect('/accounting/dashboard')
  redirect('/accounting/unauthorized')
}
