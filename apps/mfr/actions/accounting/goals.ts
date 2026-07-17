'use server'

// Admin action: set the annual contribution goal shown as a progress bar on
// every shareholder's dashboard.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { contributionGoal } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/accounting/authz'

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  amount: z.coerce.number().positive('Goal must be greater than zero'),
})

export type ActionState = { error?: string; saved?: boolean } | undefined

/** Sets (or replaces) the contribution goal for a fiscal year (the `year`
 * field holds the fiscal year — see @/lib/fiscalYear). */
export async function setContributionGoal(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()

  const parsed = schema.safeParse({
    year: formData.get('year'),
    amount: formData.get('amount'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const amount = parsed.data.amount.toString()
  await db
    .insert(contributionGoal)
    .values({ year: parsed.data.year, amount, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: contributionGoal.year,
      set: { amount, updatedAt: new Date() },
    })

  revalidatePath('/accounting/dashboard')
  revalidatePath('/accounting/admin')
  return { saved: true }
}
