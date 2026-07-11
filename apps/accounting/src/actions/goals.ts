"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  amount: z.coerce.number().positive("Goal must be greater than zero"),
});

export type ActionState = { error?: string; saved?: boolean } | undefined;

/** Sets (or replaces) the contribution goal for a calendar year. */
export async function setContributionGoal(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    year: formData.get("year"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.contributionGoal.upsert({
    where: { year: parsed.data.year },
    update: { amount: parsed.data.amount },
    create: { year: parsed.data.year, amount: parsed.data.amount },
  });

  revalidatePath("/accounting/dashboard");
  revalidatePath("/accounting/admin");
  return { saved: true };
}
