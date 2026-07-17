'use server'

// Admin action: record a TRANSFER of shares between two shareholders. One
// transaction, double-entry ledger rows (see below), an approval-inbox row
// for each party, and a notification email to each (sent/received wording).

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { shareholder, transaction, ledgerEntry, transactionApproval } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Decimal } from '@/lib/accounting/decimal'
import { requireAdmin } from '@/lib/accounting/authz'
import { sendEmail, appUrl } from '@/lib/accounting/email'
import { formatUSD, formatDate } from '@/lib/accounting/format'
import { TransferNotification } from '@/emails/accounting/TransferNotification'
import { TransactionType } from '@/lib/accounting/enums'

const schema = z
  .object({
    fromShareholderId: z.string().min(1, 'Select who the shares are coming from'),
    toShareholderId: z.string().min(1, 'Select who the shares are going to'),
    amount: z.coerce.number().positive('Amount must be greater than zero'),
    description: z.string().trim().min(1, 'A description is required'),
  })
  .refine((d) => d.fromShareholderId !== d.toShareholderId, {
    message: 'From and to shareholders must be different',
    path: ['toShareholderId'],
  })

export type ActionState = { error?: string; success?: boolean } | undefined

export async function createTransfer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin()

  const parsed = schema.safeParse({
    fromShareholderId: formData.get('fromShareholderId'),
    toShareholderId: formData.get('toShareholderId'),
    amount: formData.get('amount'),
    description: formData.get('description'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { fromShareholderId, toShareholderId, amount, description } = parsed.data

  const [from, to] = await Promise.all([
    db.query.shareholder.findFirst({
      where: eq(shareholder.id, fromShareholderId),
    }),
    db.query.shareholder.findFirst({
      where: eq(shareholder.id, toShareholderId),
    }),
  ])
  if (!from || !from.active || !to || !to.active) {
    return { error: 'Shareholder not found or inactive' }
  }

  const txn = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(transaction)
      .values({
        type: TransactionType.TRANSFER,
        description,
        createdById: session.user.id,
        createdByName: session.user.name ?? null,
        createdByEmail: session.user.email ?? null,
      })
      .returning()

    // Double-entry: a negative row for the sender and a positive row for
    // the receiver, so the transfer nets to zero and each side's balance is
    // just the sum of their own entries.
    await tx.insert(ledgerEntry).values([
      {
        transactionId: t.id,
        shareholderId: from.id,
        shares: new Decimal(amount).neg().toString(),
      },
      {
        transactionId: t.id,
        shareholderId: to.id,
        shares: new Decimal(amount).toString(),
      },
    ])

    await tx.insert(transactionApproval).values([
      { transactionId: t.id, shareholderId: from.id },
      { transactionId: t.id, shareholderId: to.id },
    ])

    return t
  })

  const adminName = session.user.name ?? session.user.email ?? 'The admin'
  const amountStr = formatUSD(amount)
  const dateStr = formatDate(txn.createdAt)

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  await Promise.all([
    from.email
      ? sendEmail({
          to: from.email,
          subject: `Transfer of ${amountStr} to ${to.name} recorded`,
          react: TransferNotification({
            recipientName: from.name,
            direction: 'sent',
            counterpartyName: to.name,
            amount: amountStr,
            description,
            date: dateStr,
            adminName,
            inboxUrl: appUrl('/inbox'),
          }),
          replyTo: session.user.email ?? undefined,
        })
      : Promise.resolve(),
    to.email
      ? sendEmail({
          to: to.email,
          subject: `Transfer of ${amountStr} from ${from.name} recorded`,
          react: TransferNotification({
            recipientName: to.name,
            direction: 'received',
            counterpartyName: from.name,
            amount: amountStr,
            description,
            date: dateStr,
            adminName,
            inboxUrl: appUrl('/inbox'),
          }),
          replyTo: session.user.email ?? undefined,
        })
      : Promise.resolve(),
  ])

  revalidatePath('/accounting/admin/transactions')
  revalidatePath('/accounting/admin/activity')
  revalidatePath('/accounting/dashboard')
  revalidatePath('/accounting/contributions')
  return { success: true }
}
