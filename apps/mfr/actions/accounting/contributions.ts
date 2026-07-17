'use server'

// Admin action: record a CONTRIBUTION — money in from one shareholder, $1 = 1
// share. Creates the transaction + ledger entry + approval-inbox row, then
// emails the shareholder (reply-to set to the recording admin).

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { shareholder, transaction, ledgerEntry, transactionApproval } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/accounting/authz'
import { sendEmail, appUrl } from '@/lib/accounting/email'
import { formatUSD, formatDate } from '@/lib/accounting/format'
import { ContributionNotification } from '@/emails/accounting/ContributionNotification'
import { TransactionType } from '@/lib/accounting/enums'

const schema = z.object({
  shareholderId: z.string().min(1, 'Select a shareholder'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  description: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullish(),
})

export type ActionState = { error?: string; success?: boolean } | undefined

export async function createContribution(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin()

  const parsed = schema.safeParse({
    shareholderId: formData.get('shareholderId'),
    amount: formData.get('amount'),
    description: formData.get('description'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

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
        createdById: session.user.id,
        createdByName: session.user.name ?? null,
        createdByEmail: session.user.email ?? null,
      })
      .returning()

    await tx.insert(ledgerEntry).values({
      transactionId: t.id,
      shareholderId: shareholderRow.id,
      shares: parsed.data.amount.toString(),
    })

    await tx.insert(transactionApproval).values({
      transactionId: t.id,
      shareholderId: shareholderRow.id,
    })

    return t
  })

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  if (shareholderRow.email) {
    await sendEmail({
      to: shareholderRow.email,
      subject: `Contribution of ${formatUSD(parsed.data.amount)} recorded`,
      react: ContributionNotification({
        shareholderName: shareholderRow.name,
        amount: formatUSD(parsed.data.amount),
        date: formatDate(createdTransaction.createdAt),
        adminName: session.user.name ?? session.user.email ?? 'The admin',
        inboxUrl: appUrl('/inbox'),
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
