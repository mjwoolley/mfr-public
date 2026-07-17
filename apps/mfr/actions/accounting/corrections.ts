'use server'

// Admin action: record a CORRECTION that replaces a mistaken transaction.
// The correction carries the full intended amounts (not deltas) and the
// original is soft-deleted in the same DB transaction — the ledger's only
// "edit" path. Affected shareholders are emailed.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { transaction, ledgerEntry, transactionApproval } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/accounting/authz'
import { sendEmail, appUrl } from '@/lib/accounting/email'
import { formatUSD, formatDate } from '@/lib/accounting/format'
import { CorrectionNotification } from '@/emails/accounting/CorrectionNotification'
import { TransactionType } from '@/lib/accounting/enums'

const metaSchema = z.object({
  originalTransactionId: z.string().min(1),
  description: z.string().trim().min(1, 'A description is required'),
})

export type ActionState = { error?: string; success?: boolean } | undefined

export async function createCorrection(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin()

  const meta = metaSchema.safeParse({
    originalTransactionId: formData.get('originalTransactionId'),
    description: formData.get('description'),
  })
  if (!meta.success) {
    return { error: meta.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { originalTransactionId, description } = meta.data

  const original = await db.query.transaction.findFirst({
    where: eq(transaction.id, originalTransactionId),
    with: { entries: { with: { shareholder: true } } },
  })
  if (!original) {
    return { error: 'Original transaction not found' }
  }

  // The correction form (transactions-client.tsx) posts one field per affected
  // shareholder, named `amount_<shareholderId>` — every shareholder on the
  // original must get a non-zero replacement amount.
  const entries: { shareholderId: string; shares: number }[] = []
  for (const originalEntry of original.entries) {
    const raw = formData.get(`amount_${originalEntry.shareholderId}`)
    const amount = Number(raw)
    if (!raw || Number.isNaN(amount) || amount === 0) {
      return { error: `Enter a non-zero correction amount for ${originalEntry.shareholder.name}` }
    }
    entries.push({ shareholderId: originalEntry.shareholderId, shares: amount })
  }
  if (entries.length === 0) {
    return { error: 'The original transaction has nothing to correct' }
  }

  const correction = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(transaction)
      .values({
        type: TransactionType.CORRECTION,
        description,
        createdById: session.user.id,
        createdByName: session.user.name ?? null,
        createdByEmail: session.user.email ?? null,
        correctsTransactionId: original.id,
      })
      .returning()

    await tx.insert(ledgerEntry).values(
      entries.map((e) => ({
        transactionId: created.id,
        shareholderId: e.shareholderId,
        shares: e.shares.toString(),
      })),
    )

    await tx.insert(transactionApproval).values(
      entries.map((e) => ({
        transactionId: created.id,
        shareholderId: e.shareholderId,
      })),
    )

    // The correction fully replaces the original on the ledger — the
    // original is soft-deleted (stays visible, struck through, everywhere
    // it's listed) but excluded from every balance/total.
    await tx
      .update(transaction)
      .set({ deleted: true, deletedAt: new Date() })
      .where(eq(transaction.id, original.id))

    return created
  })

  const adminName = session.user.name ?? session.user.email ?? 'The admin'
  const dateStr = formatDate(correction.createdAt)

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  await Promise.all(
    original.entries.map((e) => {
      const entry = entries.find((x) => x.shareholderId === e.shareholderId)!
      if (!e.shareholder.email) return Promise.resolve()
      return sendEmail({
        to: e.shareholder.email,
        subject: `Correction of ${formatUSD(entry.shares)} recorded`,
        react: CorrectionNotification({
          shareholderName: e.shareholder.name,
          amount: formatUSD(entry.shares),
          description,
          originalType: original.type,
          date: dateStr,
          adminName,
          inboxUrl: appUrl('/inbox'),
        }),
        replyTo: session.user.email ?? undefined,
      })
    }),
  )

  revalidatePath('/accounting/admin/transactions')
  revalidatePath('/accounting/admin/activity')
  revalidatePath('/accounting/dashboard')
  revalidatePath('/accounting/contributions')
  return { success: true }
}
