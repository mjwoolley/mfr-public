'use server'

// Admin action: record a CORRECTION that replaces a mistaken transaction.
// The correction carries the full intended amounts (not deltas) and the
// original is soft-deleted in the same DB transaction — the ledger's only
// "edit" path. Affected shareholders are emailed.
//
// The correction's date defaults to the ORIGINAL's, not today. Every
// fiscal-year figure buckets on createdAt, so stamping the replacement with
// today's date would quietly move money out of a closed year and into the
// current one: the struck-through original leaves FY2019 short and the
// replacement inflates FY2026. Defaulting to the original's date keeps a
// correction fiscal-year-neutral unless the admin deliberately says otherwise.
// The audit trail is not lost — the original's deletedAt records when the
// correction was actually keyed in.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { transaction, ledgerEntry, transactionApproval } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/accounting/authz'
import { sendEmail, appUrl } from '@/lib/accounting/email'
import { formatShares, formatDate } from '@/lib/accounting/format'
import { parseTransactionDate } from '@/lib/accounting/transactionDate'
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

  // Blank means "same day as the original", not "today" — see the note above.
  const date = parseTransactionDate(formData.get('date'))
  if (!date.ok) return { error: date.error }
  const correctionDate = date.date ?? original.createdAt

  const correction = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(transaction)
      .values({
        type: TransactionType.CORRECTION,
        description,
        createdAt: correctionDate,
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
        createdAt: created.createdAt,
      })),
    )

    await tx.insert(transactionApproval).values(
      entries.map((e) => ({
        transactionId: created.id,
        shareholderId: e.shareholderId,
        createdAt: created.createdAt,
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
        subject: `Correction of ${formatShares(entry.shares)} shares recorded`,
        react: CorrectionNotification({
          shareholderName: e.shareholder.name,
          amount: `${formatShares(entry.shares)} shares`,
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
