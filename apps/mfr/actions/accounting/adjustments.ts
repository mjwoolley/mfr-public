"use server";

// Admin action: record an ADJUSTMENT — a signed share credit/debit outside the
// normal contribution/transfer flows (e.g. a write-off). Creates the ledger
// entry plus an approval-inbox row, then emails the affected shareholder.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/accounting/prisma";
import { requireAdmin } from "@/lib/accounting/authz";
import { sendEmail, appUrl } from "@/lib/accounting/email";
import { formatUSD, formatDate } from "@/lib/accounting/format";
import { AdjustmentNotification } from "@/emails/accounting/AdjustmentNotification";
import { TransactionType } from "@/generated/prisma/client";

const schema = z.object({
  shareholderId: z.string().min(1, "Select a shareholder"),
  amount: z.coerce.number().refine((n) => n !== 0, "Amount must not be zero"),
  description: z.string().trim().min(1, "A description is required"),
});

export type ActionState = { error?: string; success?: boolean } | undefined;

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
      createdByName: session.user.name ?? null,
      createdByEmail: session.user.email ?? null,
      entries: { create: { shareholderId: shareholder.id, shares: amount } },
      approvals: { create: { shareholderId: shareholder.id } },
    },
  });

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  if (shareholder.email) {
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
  }

  revalidatePath("/accounting/admin/transactions");
  revalidatePath("/accounting/admin/activity");
  revalidatePath("/accounting/dashboard");
  revalidatePath("/accounting/contributions");
  return { success: true };
}
