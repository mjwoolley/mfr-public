"use server";

// Admin action: record a CONTRIBUTION — money in from one shareholder, $1 = 1
// share. Creates the transaction + ledger entry + approval-inbox row, then
// emails the shareholder (reply-to set to the recording admin).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/accounting/prisma";
import { requireAdmin } from "@/lib/accounting/authz";
import { sendEmail, appUrl } from "@/lib/accounting/email";
import { formatUSD, formatDate } from "@/lib/accounting/format";
import { ContributionNotification } from "@/emails/accounting/ContributionNotification";
import { TransactionType } from "@/generated/prisma/client";

const schema = z.object({
  shareholderId: z.string().min(1, "Select a shareholder"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  description: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish(),
});

export type ActionState = { error?: string; success?: boolean } | undefined;

export async function createContribution(
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

  const shareholder = await prisma.shareholder.findUnique({
    where: { id: parsed.data.shareholderId },
  });
  if (!shareholder || !shareholder.active) {
    return { error: "Shareholder not found or inactive" };
  }

  const transaction = await prisma.transaction.create({
    data: {
      type: TransactionType.CONTRIBUTION,
      description: parsed.data.description ?? null,
      createdById: session.user.id,
      createdByName: session.user.name ?? null,
      createdByEmail: session.user.email ?? null,
      entries: {
        create: { shareholderId: shareholder.id, shares: parsed.data.amount },
      },
      approvals: {
        create: { shareholderId: shareholder.id },
      },
    },
  });

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  if (shareholder.email) {
    await sendEmail({
      to: shareholder.email,
      subject: `Contribution of ${formatUSD(parsed.data.amount)} recorded`,
      react: ContributionNotification({
        shareholderName: shareholder.name,
        amount: formatUSD(parsed.data.amount),
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
