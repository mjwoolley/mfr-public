"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

const schema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  incurredAt: z.coerce.date({ error: "Enter a valid date" }),
});

export type ActionState = { error?: string } | undefined;

/** Create-only, like the rest of the ledger — no edit/delete in v1. */
export async function createExpense(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin();

  const parsed = schema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    incurredAt: formData.get("incurredAt"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.expense.create({
    data: {
      description: parsed.data.description,
      amount: parsed.data.amount,
      incurredAt: parsed.data.incurredAt,
      createdByUserId: session.user.id,
      createdByName: session.user.name ?? null,
      createdByEmail: session.user.email ?? null,
    },
  });

  revalidatePath("/accounting/reports");
}
