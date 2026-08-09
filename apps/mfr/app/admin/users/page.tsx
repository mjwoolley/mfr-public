import type { Metadata } from 'next'
import { requireUserAdmin } from '@/lib/authz'
import { listUsersWithRoles } from '@/lib/users'
import { UsersClient } from './UsersClient'

export const metadata: Metadata = { title: 'User management' }

export default async function UsersAdminPage() {
  const session = await requireUserAdmin()
  const users = await listUsersWithRoles()
  const viewerIsOwner = session.user.roles.siteOwner

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
        Approve or block family members. Only the site owner can assign roles.
      </p>
      <UsersClient users={users} currentUserId={session.user.id} viewerIsOwner={viewerIsOwner} />
    </section>
  )
}
