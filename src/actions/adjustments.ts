"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { sendEmail, appUrl } from "@/lib/email";
import { formatUSD, formatDate } from "@/lib/format";
import { AdjustmentNotification } from "@/emails/AdjustmentNotification";
import { TransactionType } from "@/generated/prisma/client";

const schema = z.object({
  shareholderId: z.string().min(1, "Select a shareholder"),
  amount: z.coerce.number().refine((n) => n !== 0, "Amount must not be zero"),
  description: z.string().trim().min(1, "A description is required"),
});

export type ActionState = { error?: string } | undefined;

export async function createAdjustment(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin();

  const parsed = schema.safeParse({
    shareholderId: formData.get("shareholderId"),
    amount: formData.get("amount"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { shareholderId, amount, description } = parsed.data;

  const shareholder = await prisma.shareholder.findUnique({ where: { id: shareholderId } });
  if (!shareholder || !shareholder.active) {
    return { error: "Shareholder not found or inactive" };
  }

  const transaction = await prisma.transaction.create({
    data: {
      type: TransactionType.ADJUSTMENT,
      description,
      createdById: session.user.id,
      entries: { create: { shareholderId: shareholder.id, shares: amount } },
      approvals: { create: { shareholderId: shareholder.id } },
    },
  });

  await sendEmail({
    to: shareholder.email,
    subject: `Balance adjustment of ${formatUSD(amount)} recorded`,
    react: AdjustmentNotification({
      shareholderName: shareholder.name,
      amount: formatUSD(amount),
      description,
      date: formatDate(transaction.createdAt),
      adminName: session.user.name ?? session.user.email ?? "The admin",
      inboxUrl: appUrl("/inbox"),
    }),
    replyTo: session.user.email ?? undefined,
  });

  revalidatePath("/accounting/admin/transactions");
  redirect("/accounting/admin/transactions");
}
