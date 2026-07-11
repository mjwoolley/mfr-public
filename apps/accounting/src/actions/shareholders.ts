"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { Prisma } from "@/generated/prisma/client";

// Empty string (an omitted optional email in the form) becomes `null`, not
// `""` — Postgres's unique constraint on `email` allows any number of NULLs,
// but two empty strings would collide.
const emailField = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? v.toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, {
    message: "Enter a valid email",
  });

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: emailField,
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

  const { name, email } = parsed.data;

  // Only pre-check uniqueness when an email was actually given — Postgres
  // allows multiple NULLs under the unique constraint, so there's nothing to
  // check (and calling findUnique with a null email would be meaningless).
  if (email) {
    const existing = await prisma.shareholder.findUnique({ where: { email } });
    if (existing) {
      return { error: "A shareholder with that email already exists" };
    }
  }

  await prisma.shareholder.create({
    data: { name, email },
  });

  revalidatePath("/accounting/admin/shareholders");
  redirect("/accounting/admin/shareholders");
}

const updateSchema = z.object({
  shareholderId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  email: emailField,
});

/** Edits a shareholder's name/email in place (stays on the Edit page). */
export async function updateShareholder(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = updateSchema.safeParse({
    shareholderId: formData.get("shareholderId"),
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { shareholderId, name, email } = parsed.data;

  if (email) {
    const existing = await prisma.shareholder.findUnique({ where: { email } });
    if (existing && existing.id !== shareholderId) {
      return { error: "A shareholder with that email already exists" };
    }
  }

  await prisma.shareholder.update({
    where: { id: shareholderId },
    data: { name, email },
  });

  revalidatePath("/accounting/admin/shareholders");
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`);
}

export async function setShareholderActive(shareholderId: string, active: boolean) {
  await requireAdmin();
  await prisma.shareholder.update({
    where: { id: shareholderId },
    data: { active },
  });
  revalidatePath("/accounting/admin/shareholders");
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`);
}

/**
 * Links a shareholder to an identity-DB user found via the shareholder-search
 * API route. `Shareholder.userId` is `@unique`, so linking to a user already
 * linked to a different shareholder fails with a friendly error rather than a
 * raw Prisma exception.
 */
export async function linkShareholderToUser(
  shareholderId: string,
  userId: string,
): Promise<{ error?: string } | undefined> {
  await requireAdmin();

  try {
    await prisma.shareholder.update({
      where: { id: shareholderId },
      data: { userId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That login is already linked to a different shareholder" };
    }
    throw err;
  }

  revalidatePath("/accounting/admin/shareholders");
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`);
}

export async function unlinkShareholder(shareholderId: string) {
  await requireAdmin();
  await prisma.shareholder.update({
    where: { id: shareholderId },
    data: { userId: null },
  });
  revalidatePath("/accounting/admin/shareholders");
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`);
}
