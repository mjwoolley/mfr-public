'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/identityDb'
import { portalDb } from '@/lib/portalDb'
import { portalUserRoles } from '@/lib/db/schema'
import { requireSiteOwner } from '@/lib/authz'

export type ActionResult = { ok: true } | { error: string }

const statusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(['pending', 'approved', 'blocked']),
})

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['siteOwner', 'siteManager', 'accountingManager']),
  value: z.boolean(),
})

export async function setUserStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const session = await requireSiteOwner()
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { userId, status } = parsed.data

  // An owner can't lock themselves out of their own account.
  if (userId === session.user.id && status !== 'approved') {
    return { error: "You can't change your own account status." }
  }

  await identityDb.update(users).set({ status }).where(eq(users.id, userId))
  revalidatePath('/admin/users')
  return { ok: true }
}

export async function setUserRole(input: z.input<typeof roleSchema>): Promise<ActionResult> {
  const session = await requireSiteOwner()
  const parsed = roleSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { userId, role, value } = parsed.data

  // An owner can't remove their own site-owner role (avoids locking everyone
  // out of user management).
  if (userId === session.user.id && role === 'siteOwner' && value === false) {
    return { error: "You can't remove your own site-owner role." }
  }

  // Explicit switch keeps the dynamic column write type-safe.
  const patch =
    role === 'siteOwner'
      ? { isSiteOwner: value }
      : role === 'siteManager'
        ? { isSiteManager: value }
        : { isAccountingManager: value }

  await portalDb
    .insert(portalUserRoles)
    .values({ identityUserId: userId, ...patch })
    .onConflictDoUpdate({
      target: portalUserRoles.identityUserId,
      set: { ...patch, updatedAt: new Date() },
    })
  revalidatePath('/admin/users')
  return { ok: true }
}
