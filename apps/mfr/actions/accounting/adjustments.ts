"use server";

// Admin action: record an ADJUSTMENT — a signed share credit/debit outside the
// normal contribution/transfer flows (e.g. a write-off). Creates the ledger
// entry plus an approval-inbox row, then emails the affected shareholder.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareholder, transaction, ledgerEntry, transactionApproval } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/accounting/authz";
import { sendEmail, appUrl } from "@/lib/accounting/email";
import { formatUSD, formatDate } from "@/lib/accounting/format";
import { AdjustmentNotification } from "@/emails/accounting/AdjustmentNotification";
import { TransactionType } from "@/lib/accounting/enums";

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

  const shareholderRow = await db.query.shareholder.findFirst({
    where: eq(shareholder.id, shareholderId),
  });
  if (!shareholderRow || !shareholderRow.active) {
    return { error: "Shareholder not found or inactive" };
  }

  const createdTransaction = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(transaction)
      .values({
        type: TransactionType.ADJUSTMENT,
        description,
        createdById: session.user.id,
        createdByName: session.user.name ?? null,
        createdByEmail: session.user.email ?? null,
      })
      .returning();
    await tx.insert(ledgerEntry).values({
      transactionId: t.id,
      shareholderId: shareholderRow.id,
      shares: amount.toString(),
    });
    await tx.insert(transactionApproval).values({
      transactionId: t.id,
      shareholderId: shareholderRow.id,
    });
    return t;
  });

  // Shareholder.email is optional (Phase 11) — no address to notify if unset.
  if (shareholderRow.email) {
    await sendEmail({
      to: shareholderRow.email,
      subject: `Balance adjustment of ${formatUSD(amount)} recorded`,
      react: AdjustmentNotification({
        shareholderName: shareholderRow.name,
        amount: formatUSD(amount),
        description,
        date: formatDate(createdTransaction.createdAt),
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
