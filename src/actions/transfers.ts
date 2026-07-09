"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
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

export type ActionState = { error?: string } | undefined;

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

  await Promise.all([
    sendEmail({
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
    }),
    sendEmail({
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
    }),
  ]);

  revalidatePath("/accounting/admin/transactions");
  redirect("/accounting/admin/transactions");
}
