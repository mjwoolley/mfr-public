import type { Metadata } from 'next'
import { requireSiteOwner } from '@/lib/authz'
import { listUsersWithRoles } from '@/lib/users'
import { UsersClient } from './UsersClient'

export const metadata: Metadata = { title: 'User management' }

export default async function UsersAdminPage() {
  const session = await requireSiteOwner()
  const users = await listUsersWithRoles()

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-7">
      <div
        className="text-xs font-bold tracking-[0.22em] uppercase"
        style={{ color: 'var(--color-accent-700)' }}
      >
        Admin
      </div>
      <h1 className="mt-2 text-4xl">User management</h1>
      <p className="text-muted mt-3 max-w-2xl">
        Approve or block family members and assign roles. Only the site owner can manage users.
      </p>
      <UsersClient users={users} currentUserId={session.user.id} />
    </section>
  )
}
