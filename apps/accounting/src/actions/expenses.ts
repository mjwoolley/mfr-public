"use server";

// Admin CRUD for house expenses. Expenses live outside the share ledger (no
// balances, no approvals): edits keep the original incurredAt and deletes are
// hard — see the comments on updateSchema and deleteExpense.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { ExpenseCategory } from "@/generated/prisma/enums";

const createSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  category: z.enum(ExpenseCategory, { error: "Choose a category" }),
  capital: z.coerce.boolean(),
  incurredAt: z.coerce.date({ error: "Enter a valid date" }),
});

// Edits deliberately exclude incurredAt: an expense keeps its original date,
// so the year it lands in the income/expense report never shifts after the
// fact.
const updateSchema = createSchema.omit({ incurredAt: true });

export type ActionState = { error?: string; success?: boolean } | undefined;

function revalidateExpenseViews() {
  revalidatePath("/accounting/expenses");
  revalidatePath("/accounting/admin/expenses");
}

export async function createExpense(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin();

  const parsed = createSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    category: formData.get("category"),
    capital: formData.get("capital") === "true",
    incurredAt: formData.get("incurredAt"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.expense.create({
    data: {
      description: parsed.data.description,
      amount: parsed.data.amount,
      category: parsed.data.category,
      capital: parsed.data.capital,
      incurredAt: parsed.data.incurredAt,
      createdByUserId: session.user.id,
      createdByName: session.user.name ?? null,
      createdByEmail: session.user.email ?? null,
    },
  });

  revalidateExpenseViews();
  return { success: true };
}

export async function updateExpense(
  expenseId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = updateSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    category: formData.get("category"),
    capital: formData.get("capital") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing) {
    return { error: "Expense not found" };
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      description: parsed.data.description,
      amount: parsed.data.amount,
      category: parsed.data.category,
      capital: parsed.data.capital,
      // incurredAt intentionally untouched — see updateSchema comment.
    },
  });

  revalidateExpenseViews();
  return { success: true };
}

// Hard delete: expenses carry no share/balance implications (unlike ledger
// transactions, which are soft-deleted via corrections), so a removed
// expense simply disappears from the log and the reports.
export async function deleteExpense(
  expenseId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing) {
    return { error: "Expense not found" };
  }

  await prisma.expense.delete({ where: { id: expenseId } });

  revalidateExpenseViews();
  return { success: true };
}
