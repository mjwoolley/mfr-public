"use server";

// Admin action: record a TRANSFER of shares between two shareholders. One
// transaction, double-entry ledger rows (see below), an approval-inbox row
// for each party, and a notification email to each (sent/received wording).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { sendEmail, appUrl } from "@/lib/email";
import { formatUSD, formatDate } from "@/lib/format";
import { TransferNotification } from "@/emails/TransferNotification";
import { TransactionType } from "@/generated/prisma/client";

const schema = z
  .object({
    fromShareholderId: z.string().min(1, "Select who the shares are coming from"),
    toShareholderId: z.string().min(1, "Select who the shares are going to"),
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    description: z.string().trim().min(1, "A description is required"),
  })
  .refine((d) => d.fromShareholderId !== d.toShareholderId, {
    message: "From and to shareholders must be different",
    path: ["toShareholderId"],
  });

export type ActionState = { error?: string; success?: boolean } | undefined;

export async function createTransfer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin();

  const parsed = schema.safeParse({
    fromShareholderId: formData.get("fromShareholderId"),
    toShareholderId: formData.get("toShareholderId"),
    amount: formData.get("amount"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { fromShareholderId, toShareholderId, amount, description } = parsed.data;

  const [from, to] = await Promise.all([
    prisma.shareholder.findUnique({ where: { id: fromShareholderId } }),
    prisma.shareholder.findUnique({ where: { id: toShareholderId } }),
  ]);
  if (!from || !from.active || !to || !to.active) {
    return { error: "Shareholder not found or inactive" };
  }

  const transaction = await prisma.transaction.create({
    data: {
      type: TransactionType.TRANSFER,
      description,
      createdById: session.user.id,
      createdByName: session.user.name ?? null,
      createdByEmail: session.user.email ?? null,
      // Double-entry: a negative row for the sender and a positive row for
      // the receiver, so the transfer nets to zero and each side's balance is
      // just the sum of their own entries.
      entries: {
        create: [
          { shareholderId: from.id, shares: -amount },
          { shareholderId: to.id, shares: amount },
        ],
      },
      approvals: {
        create: [{ shareholderId: from.id }, { shareholderId: to.id }],
      },
    },
  });

  const adminName = session.user.name ?? session.user.email ?? "The admin";
  const amountStr = formatUSD(amount);
  const dateStr = formatDate(transaction.createdAt);

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  await Promise.all([
    from.email
      ? sendEmail({
          to: from.email,
          subject: `Transfer of ${amountStr} to ${to.name} recorded`,
          react: TransferNotification({
            recipientName: from.name,
            direction: "sent",
            counterpartyName: to.name,
            amount: amountStr,
            description,
            date: dateStr,
            adminName,
            inboxUrl: appUrl("/inbox"),
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
            direction: "received",
            counterpartyName: from.name,
            amount: amountStr,
            description,
            date: dateStr,
            adminName,
            inboxUrl: appUrl("/inbox"),
          }),
          replyTo: session.user.email ?? undefined,
        })
      : Promise.resolve(),
  ]);

  revalidatePath("/accounting/admin/transactions");
  revalidatePath("/accounting/admin/activity");
  revalidatePath("/accounting/dashboard");
  revalidatePath("/accounting/contributions");
  return { success: true };
}
