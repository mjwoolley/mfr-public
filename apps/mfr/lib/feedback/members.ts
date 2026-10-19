// Identity lookups for Feedback: whether an email still belongs to an approved
// member, and who the site admins are (site owners and site managers; an
// accounting-manager role alone does not qualify).

import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { portalUserRoles } from '@/lib/db/schema'

export async function findApprovedMember(
  email: string,
): Promise<{ email: string; name: string } | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  const [row] = await identityDb
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, eq(users.status, 'approved')))
    .limit(1)
  return row ? { email: row.email, name: row.name ?? '' } : null
}

export async function listSiteAdminEmails(): Promise<string[]> {
  const roleRows = await portalDb
    .select({ id: portalUserRoles.identityUserId })
    .from(portalUserRoles)
    .where(or(eq(portalUserRoles.isSiteOwner, true), eq(portalUserRoles.isSiteManager, true)))
  const ids = roleRows.map((r) => r.id)
  if (ids.length === 0) return []
  const rows = await identityDb
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, 'approved')))
  return rows.map((r) => r.email)
}
