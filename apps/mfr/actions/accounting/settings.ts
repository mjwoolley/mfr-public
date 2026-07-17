'use server'

// Admin action for the AppSettings singleton (currently just the
// Contributions-tab visibility toggle).

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/accounting/authz'

/**
 * Flips the Contributions-tab visibility (Everyone vs Admins-only). The tab
 * row and the contributions page both read this on every request, so the
 * change takes effect immediately for all shareholders.
 */
export async function setContributionsVisibility(visibleToAll: boolean): Promise<void> {
  await requireAdmin()

  await db
    .insert(appSettings)
    .values({
      id: 'singleton',
      contributionsVisibleToAll: visibleToAll,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { contributionsVisibleToAll: visibleToAll, updatedAt: new Date() },
    })

  // The tab row renders on every page; revalidate the app root so the
  // Contributions tab appears/disappears without a hard refresh.
  revalidatePath('/accounting', 'layout')
}
