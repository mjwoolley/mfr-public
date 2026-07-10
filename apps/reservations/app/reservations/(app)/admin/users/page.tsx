import { auth } from '@/lib/auth/config'
import { UsersClient } from './UsersClient'

export default async function AdminUsersPage() {
  const session = await auth()
  // admin/layout.tsx already guarantees the visitor is a portal admin of
  // some kind — the non-null assertion reflects that guarantee.
  return (
    <UsersClient
      actorIsReservationsAdmin={session!.user.isReservationsAdmin}
      actorIsAccountingAdmin={session!.user.isAccountingAdmin}
    />
  )
}
