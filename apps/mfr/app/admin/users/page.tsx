import type { Metadata } from 'next'
import { requireUserAdmin } from '@/lib/authz'
import { listUsersWithRoles } from '@/lib/users'
import { UsersClient } from './UsersClient'

export const metadata: Metadata = { title: 'User management' }

// The admin layout supplies the area heading + sub-nav; this page adds its own
// stricter gate (canApproveMembers) on top of the layout's content-admin one.
export default async function UsersAdminPage() {
  const session = await requireUserAdmin()
  const users = await listUsersWithRoles()
  const viewerIsOwner = session.user.roles.siteOwner

  return (
    <div className="w-full max-w-4xl pb-8">
      <h2 className="text-2xl">User management</h2>
      <p className="text-muted mt-3 max-w-2xl">
        Approve or block family members. Only the site owner can assign roles.
      </p>
      <UsersClient users={users} currentUserId={session.user.id} viewerIsOwner={viewerIsOwner} />
    </div>
  )
}
