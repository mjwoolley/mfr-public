// Who can be linked to a Shareholder, and who already is.
//
// Two pages need the same two facts — the shareholders list, to show who each
// record is linked to, and the Edit screen, to offer the logins that are still
// free. `Shareholder.userId` is unique, so a login already attached to one
// record can never be offered for another.
//
// There is no FK between Shareholder and users (they were separate databases
// before the merge and the reference stays logical), so this is a join in
// memory rather than in SQL — the same shape lib/users.ts already uses.

import { isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { shareholder } from '@/lib/db/schema'
import { listUsersWithRoles } from '@/lib/users'

export interface LoginOption {
  id: string
  email: string
  name: string | null
}

export interface LinkCandidates {
  /** Every approved login by id — for naming the login a shareholder is linked to. */
  byId: Map<string, LoginOption>
  /** Approved logins not yet attached to any shareholder — the dropdown's options. */
  unlinked: LoginOption[]
}

export async function getLinkCandidates(): Promise<LinkCandidates> {
  const [users, taken] = await Promise.all([
    listUsersWithRoles(),
    db.query.shareholder.findMany({
      where: isNotNull(shareholder.userId),
      columns: { userId: true },
    }),
  ])

  // Only approved logins: a pending or blocked account can't use the portal, so
  // offering it as a link target would just create a dead reference.
  const approved = users
    .filter((u) => u.status === 'approved')
    .map(({ id, email, name }) => ({ id, email, name }))

  const takenIds = new Set(taken.map((s) => s.userId as string))
  return {
    byId: new Map(approved.map((u) => [u.id, u])),
    unlinked: approved.filter((u) => !takenIds.has(u.id)),
  }
}
