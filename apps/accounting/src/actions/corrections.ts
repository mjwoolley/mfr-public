"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { sendEmail, appUrl } from "@/lib/email";
import { formatUSD, formatDate } from "@/lib/format";
import { CorrectionNotification } from "@/emails/CorrectionNotification";
import { TransactionType } from "@/generated/prisma/client";

const metaSchema = z.object({
  originalTransactionId: z.string().min(1),
  description: z.string().trim().min(1, "A description is required"),
});

export type ActionState = { error?: string } | undefined;

export async function createCorrection(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin();

  const meta = metaSchema.safeParse({
    originalTransactionId: formData.get("originalTransactionId"),
    description: formData.get("description"),
  });
  if (!meta.success) {
    return { error: meta.error.issues[0]?.message ?? "Invalid input" };
  }
  const { originalTransactionId, description } = meta.data;

  const original = await prisma.transaction.findUnique({
    where: { id: originalTransactionId },
    include: { entries: { include: { shareholder: true } } },
  });
  if (!original) {
    return { error: "Original transaction not found" };
  }

  const entries: { shareholderId: string; shares: number }[] = [];
  for (const originalEntry of original.entries) {
    const raw = formData.get(`amount_${originalEntry.shareholderId}`);
    const amount = Number(raw);
    if (!raw || Number.isNaN(amount) || amount === 0) {
      return { error: `Enter a non-zero correction amount for ${originalEntry.shareholder.name}` };
    }
    entries.push({ shareholderId: originalEntry.shareholderId, shares: amount });
  }
  if (entries.length === 0) {
    return { error: "The original transaction has nothing to correct" };
  }

  const correction = await prisma.transaction.create({
    data: {
      type: TransactionType.CORRECTION,
      description,
      createdById: session.user.id,
      correctsTransactionId: original.id,
      entries: { create: entries },
      approvals: { create: entries.map((e) => ({ shareholderId: e.shareholderId })) },
    },
  });

  const adminName = session.user.name ?? session.user.email ?? "The admin";
  const dateStr = formatDate(correction.createdAt);

  await Promise.all(
    original.entries.map((e) => {
      const entry = entries.find((x) => x.shareholderId === e.shareholderId)!;
      return sendEmail({
        to: e.shareholder.email,
        subject: `Correction of ${formatUSD(entry.shares)} recorded`,
        react: CorrectionNotification({
          shareholderName: e.shareholder.name,
          amount: formatUSD(entry.shares),
          description,
          originalType: original.type,
          date: dateStr,
          adminName,
          inboxUrl: appUrl("/inbox"),
        }),
        replyTo: session.user.email ?? undefined,
      });
    }),
  );

  revalidatePath("/accounting/admin/transactions");
  redirect("/accounting/admin/transactions");
}
