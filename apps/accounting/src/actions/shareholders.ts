"use server";

// Admin CRUD for Shareholder records plus login linking/unlinking against the
// shared identity DB. Shareholders exist independently of Google logins; the
// link can be made automatically (by email, here and at sign-in) or manually
// (via the edit page's search control).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ilike } from "drizzle-orm";
import { users } from "@mfr/auth";
import { prisma } from "@/lib/prisma";
import { identityDb } from "@/lib/identityDb";
import { requireAdmin } from "@/lib/authz";
import { Prisma } from "@/generated/prisma/client";

// Looks up an identity-DB user id by exact (case-insensitive) email, so a newly
// created/edited shareholder can be linked to their login straight away — the
// same identityDb/users pattern the shareholder-search route uses. Returns null
// when no user has that email. (`extendSession` in lib/auth.ts is the reverse
// fallback: it links by email at sign-in when no link exists yet.)
async function findIdentityUserIdByEmail(email: string): Promise<string | null> {
  const [row] = await identityDb
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.email, email))
    .limit(1);
  return row?.id ?? null;
}

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

  // If an identity user already exists with this email, link them on create so
  // the shareholder doesn't have to be linked by hand afterward.
  const userId = email ? await findIdentityUserIdByEmail(email) : null;

  try {
    await prisma.shareholder.create({
      data: { name, email, userId },
    });
  } catch (err) {
    // Shareholder.userId is @unique — the matched login may already belong to a
    // different shareholder. Fail friendly rather than with a raw Prisma error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That login is already linked to a different shareholder" };
    }
    throw err;
  }

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

  const current = await prisma.shareholder.findUnique({ where: { id: shareholderId } });
  if (!current) {
    return { error: "Shareholder not found" };
  }

  if (email) {
    const existing = await prisma.shareholder.findUnique({ where: { email } });
    if (existing && existing.id !== shareholderId) {
      return { error: "A shareholder with that email already exists" };
    }
  }

  // When the email changes to one that matches an identity user, link that
  // login now. Only re-link on an actual change so a manual link is preserved,
  // and never clear an existing link just because the new email has no user.
  let userId = current.userId;
  if (email && email !== current.email) {
    const found = await findIdentityUserIdByEmail(email);
    if (found) userId = found;
  }

  try {
    await prisma.shareholder.update({
      where: { id: shareholderId },
      data: { name, email, userId },
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
