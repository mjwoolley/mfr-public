'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { portalDb } from '@/lib/portalDb'
import { portalMealRsvps } from '@/lib/db/schema'
import { requireApproved } from '@/lib/authz'

export type ActionResult = { ok: true } | { error: string }

const toggleSchema = z.object({
  dayIndex: z.coerce.number().int().min(1).max(21),
  meal: z.enum(['L', 'D']),
})

/**
 * Any approved member toggles their own attendance for a given meal. Presence
 * of a row = attending, so toggling deletes it if present, inserts if not.
 */
export async function toggleMeal(input: z.input<typeof toggleSchema>): Promise<ActionResult> {
  const session = await requireApproved()
  const parsed = toggleSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { dayIndex, meal } = parsed.data
  const userId = session.user.id

  const where = and(
    eq(portalMealRsvps.identityUserId, userId),
    eq(portalMealRsvps.dayIndex, dayIndex),
    eq(portalMealRsvps.meal, meal),
  )
  const existing = await portalDb.select({ id: portalMealRsvps.id }).from(portalMealRsvps).where(where)
  if (existing.length) {
    await portalDb.delete(portalMealRsvps).where(where)
  } else {
    await portalDb
      .insert(portalMealRsvps)
      .values({ identityUserId: userId, dayIndex, meal })
      .onConflictDoNothing()
  }
  revalidatePath('/meals')
  return { ok: true }
}
