'use server'

// Admin action: record a share purchase — money (or goods) in from one
// shareholder, $1 = 1 share. Creates the transaction + ledger entry +
// approval-inbox row, then emails the shareholder (reply-to set to the
// recording admin).
//
// The DB type is still CONTRIBUTION; only what the family reads says "share
// purchase". Likewise the posted field is still `amount` — it is a share count
// now, but renaming the wire name buys nothing.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { shareholder, transaction, ledgerEntry, transactionApproval } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/accounting/authz'
import { sendEmail, appUrl } from '@/lib/accounting/email'
import { formatShares, formatDate } from '@/lib/accounting/format'
import { parseTransactionDate } from '@/lib/accounting/transactionDate'
import { ContributionNotification } from '@/emails/accounting/ContributionNotification'
import { TransactionType } from '@/lib/accounting/enums'

const schema = z
  .object({
    shareholderId: z.string().min(1, 'Select a shareholder'),
    shares: z.coerce.number().positive('Shares must be greater than zero'),
    description: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : value))
      .nullish(),
    inKind: z.coerce.boolean(),
  })
  // An in-kind purchase is goods or labour, so the ledger is meaningless
  // without a note of what was actually contributed.
  .refine((d) => !d.inKind || !!d.description, {
    message: 'A description is required for an in-kind share purchase',
    path: ['description'],
  })

export type ActionState = { error?: string; success?: boolean } | undefined

export async function createContribution(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin()

  const parsed = schema.safeParse({
    shareholderId: formData.get('shareholderId'),
    shares: formData.get('amount'),
    description: formData.get('description'),
    inKind: formData.get('inKind') === 'true',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  // Parsed before any DB read so a bad date costs nothing.
  const date = parseTransactionDate(formData.get('date'))
  if (!date.ok) return { error: date.error }

  const shareholderRow = await db.query.shareholder.findFirst({
    where: eq(shareholder.id, parsed.data.shareholderId),
  })
  if (!shareholderRow || !shareholderRow.active) {
    return { error: 'Shareholder not found or inactive' }
  }

  const createdTransaction = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(transaction)
      .values({
        type: TransactionType.CONTRIBUTION,
        description: parsed.data.description ?? null,
        inKind: parsed.data.inKind,
        // Omitted when null so CURRENT_TIMESTAMP applies — Transaction has no
        // separate business-date column, createdAt IS the transaction date.
        ...(date.date ? { createdAt: date.date } : {}),
        createdById: session.user.id,
        createdByName: session.user.name ?? null,
        createdByEmail: session.user.email ?? null,
      })
      .returning()

    await tx.insert(ledgerEntry).values({
      transactionId: t.id,
      shareholderId: shareholderRow.id,
      shares: parsed.data.shares.toString(),
      // Same instant as the transaction, so nothing sorted by the entry's own
      // timestamp can disagree with the date the admin entered.
      createdAt: t.createdAt,
    })

    await tx.insert(transactionApproval).values({
      transactionId: t.id,
      shareholderId: shareholderRow.id,
      createdAt: t.createdAt,
    })

    return t
  })

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  if (shareholderRow.email) {
    await sendEmail({
      to: shareholderRow.email,
      subject: `Share purchase of ${formatShares(parsed.data.shares)} shares recorded`,
      react: ContributionNotification({
        shareholderName: shareholderRow.name,
        shares: formatShares(parsed.data.shares),
        date: formatDate(createdTransaction.createdAt),
        adminName: session.user.name ?? session.user.email ?? 'The admin',
        inboxUrl: appUrl('/inbox'),
        inKind: parsed.data.inKind,
        description: parsed.data.description ?? null,
      }),
      replyTo: session.user.email ?? undefined,
    })
  }

  revalidatePath('/accounting/admin/transactions')
  revalidatePath('/accounting/admin/activity')
  revalidatePath('/accounting/dashboard')
  revalidatePath('/accounting/contributions')
  return { success: true }
}
