"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
});

export type ActionState = { error?: string } | undefined;

export async function createShareholder(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.shareholder.findUnique({ where: { email } });
  if (existing) {
    return { error: "A shareholder with that email already exists" };
  }

  await prisma.shareholder.create({
    data: { name: parsed.data.name, email },
  });

  revalidatePath("/admin/shareholders");
  redirect("/admin/shareholders");
}

export async function setShareholderActive(shareholderId: string, active: boolean) {
  await requireAdmin();
  await prisma.shareholder.update({
    where: { id: shareholderId },
    data: { active },
  });
  revalidatePath("/admin/shareholders");
}
