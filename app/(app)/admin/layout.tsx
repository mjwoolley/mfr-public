import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // app/(app)/layout.tsx (the parent layout) already guarantees an
  // approved session reaches this point — this only adds the isAdmin
  // check. Non-admin approved users are quietly redirected to the
  // calendar rather than shown a 403 page; every /api/admin/* route
  // still independently enforces requireAdmin() server-side regardless
  // of what this UI-level gate does.
  if (!session?.user?.isAdmin) {
    redirect('/calendar')
  }

  return <>{children}</>
}
