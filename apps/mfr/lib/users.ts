import { asc, eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { portalUserRoles } from '@/lib/db/schema'

export interface UserWithRoles {
  id: string
  email: string
  name: string | null
  status: 'pending' | 'approved' | 'blocked'
  siteOwner: boolean
  siteManager: boolean
  accountingManager: boolean
}

/**
 * The User Management list: every identity user joined (in memory — the two
 * live in different databases, no cross-DB FK) with their portal roles. A user
 * with no roles row simply has all-false roles.
 */
export async function listUsersWithRoles(): Promise<UserWithRoles[]> {
  const [identityRows, roleRows] = await Promise.all([
    identityDb
      .select({ id: users.id, email: users.email, name: users.name, status: users.status })
      .from(users)
      .orderBy(asc(users.email)),
    portalDb.select().from(portalUserRoles),
  ])
  const roleById = new Map(roleRows.map((r) => [r.identityUserId, r]))
  return identityRows.map((u) => {
    const r = roleById.get(u.id)
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status,
      siteOwner: r?.isSiteOwner ?? false,
      siteManager: r?.isSiteManager ?? false,
      accountingManager: r?.isAccountingManager ?? false,
    }
  })
}

export interface ApprovedMember {
  id: string
  name: string | null
}

/**
 * Approved members, id + name, ordered by name — the picker an admin uses to
 * book a reservation on someone's behalf. Only approved users are bookable
 * (the reservations POST route re-checks this server-side).
 */
export async function listApprovedMembers(): Promise<ApprovedMember[]> {
  return identityDb
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.status, 'approved'))
    .orderBy(asc(users.name))
}
