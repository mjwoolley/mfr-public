import { describe, it, expect, afterEach, vi } from "vitest";
import { testDb } from "./testDb";
import { TransactionType } from "@/generated/prisma/client";

// Same reasoning as shareholders.test.ts for mocking @/lib/auth and
// next/cache's revalidatePath.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { createExpense, updateExpense } from "@/actions/expenses";
import { getContributionsByYear } from "@/lib/ledger";
import { getIncomeExpensesByYear } from "@/lib/expenses";

const ADMIN_SESSION = {
  user: {
    id: "admin-1",
    status: "approved",
    isAccountingAdmin: true,
    isReservationsAdmin: false,
    shareholderId: null,
    email: "admin@example.com",
    name: "Admin",
  },
  expires: "2099-01-01",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const NON_ADMIN_SESSION = {
  user: {
    id: "shareholder-1",
    status: "approved",
    isAccountingAdmin: false,
    isReservationsAdmin: false,
    shareholderId: "sh_1",
    email: "shareholder@example.com",
    name: "Not An Admin",
  },
  expires: "2099-01-01",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const createdExpenseIds: string[] = [];
const createdTransactionIds: string[] = [];
const createdShareholderIds: string[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  for (const id of createdExpenseIds) {
    await testDb.expense.delete({ where: { id } }).catch(() => {});
  }
  createdExpenseIds.length = 0;
  // Transactions first — LedgerEntry cascades from Transaction but not from
  // Shareholder (same ordering constraint as shareholders.test.ts).
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {});
  }
  createdTransactionIds.length = 0;
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {});
  }
  createdShareholderIds.length = 0;
});

describe("createExpense — admin-only", () => {
  it("rejects a non-admin caller and does not create a row", async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION);
    const description = `Rejected Expense ${Date.now()}`;

    await expect(
      createExpense(
        undefined,
        fd({ description, amount: "50", category: "REPAIRS", incurredAt: "2024-01-15" }),
      ),
    ).rejects.toThrow();

    const found = await testDb.expense.findFirst({ where: { description } });
    expect(found).toBeNull();
  });

  it("creates an Expense row for an admin, storing the denormalized creator fields", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const description = `Admin Expense ${Date.now()}`;

    const result = await createExpense(
      undefined,
      fd({
        description,
        amount: "123.45",
        category: "UTILITIES",
        capital: "true",
        incurredAt: "2024-02-20",
      }),
    );
    expect(result?.error).toBeUndefined();

    const created = await testDb.expense.findFirst({ where: { description } });
    expect(created).not.toBeNull();
    createdExpenseIds.push(created!.id);
    expect(created?.amount.toString()).toBe("123.45");
    expect(created?.incurredAt.toISOString().slice(0, 10)).toBe("2024-02-20");
    expect(created?.category).toBe("UTILITIES");
    expect(created?.capital).toBe(true);
    expect(created?.createdByUserId).toBe("admin-1");
    expect(created?.createdByName).toBe("Admin");
    expect(created?.createdByEmail).toBe("admin@example.com");
  });

  it("rejects a non-positive amount and does not create a row", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const description = `Bad Amount Expense ${Date.now()}`;

    const result = await createExpense(
      undefined,
      fd({ description, amount: "0", category: "REPAIRS", incurredAt: "2024-02-20" }),
    );
    expect(result?.error).toMatch(/greater than zero/i);

    const found = await testDb.expense.findFirst({ where: { description } });
    expect(found).toBeNull();
  });

  it("rejects a blank description and does not create a row", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const result = await createExpense(
      undefined,
      fd({ description: "   ", amount: "10", category: "REPAIRS", incurredAt: "2024-02-20" }),
    );
    expect(result?.error).toMatch(/description/i);
  });
});

describe("updateExpense — admin-only, date-preserving", () => {
  async function seedExpense() {
    const expense = await testDb.expense.create({
      data: {
        description: `Editable Expense ${Date.now()}`,
        amount: 100,
        category: "REPAIRS",
        capital: false,
        incurredAt: new Date("2023-05-05T00:00:00Z"),
        createdByUserId: "seed-admin",
      },
    });
    createdExpenseIds.push(expense.id);
    return expense;
  }

  it("rejects a non-admin caller and leaves the row untouched", async () => {
    const expense = await seedExpense();
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION);

    await expect(
      updateExpense(
        expense.id,
        undefined,
        fd({ description: "Hacked", amount: "1", category: "OTHER", capital: "true" }),
      ),
    ).rejects.toThrow();

    const after = await testDb.expense.findUnique({ where: { id: expense.id } });
    expect(after?.description).toBe(expense.description);
    expect(after?.amount.toString()).toBe("100");
  });

  it("updates description/amount/category/capital but never incurredAt", async () => {
    const expense = await seedExpense();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const result = await updateExpense(
      expense.id,
      undefined,
      fd({
        description: "Roof repair (corrected)",
        amount: "250.50",
        category: "IMPROVEMENTS",
        capital: "true",
      }),
    );
    expect(result?.error).toBeUndefined();
    expect(result?.success).toBe(true);

    const after = await testDb.expense.findUnique({ where: { id: expense.id } });
    expect(after?.description).toBe("Roof repair (corrected)");
    expect(after?.amount.toString()).toBe("250.5");
    expect(after?.category).toBe("IMPROVEMENTS");
    expect(after?.capital).toBe(true);
    // The original date is fixed at recording time — edits never move the
    // expense between report years.
    expect(after?.incurredAt.toISOString()).toBe(expense.incurredAt.toISOString());
  });

  it("returns an error for an unknown expense id", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const result = await updateExpense(
      "nonexistent-id",
      undefined,
      fd({ description: "X", amount: "5", category: "OTHER", capital: "false" }),
    );
    expect(result?.error).toMatch(/not found/i);
  });
});

describe("Reports figures — hand-computed against seeded data", () => {
  it("Contributions by Year: groups CONTRIBUTION entries by the transaction's createdAt year", async () => {
    const holderA = await testDb.shareholder.create({
      data: { name: `Report Holder A ${Date.now()}`, email: `report-a-${Date.now()}@example.com` },
    });
    const holderB = await testDb.shareholder.create({
      data: { name: `Report Holder B ${Date.now()}`, email: `report-b-${Date.now()}@example.com` },
    });
    createdShareholderIds.push(holderA.id, holderB.id);

    // Two contributions in 2013 (100 + 50 = 150), one in 2014 (300).
    // 2013/2014 are far from "today" (2026) so no other test's default-dated
    // (now()) fixtures can collide with these totals.
    const tx1 = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdAt: new Date("2013-03-01T00:00:00Z"),
        createdById: "seed-admin",
        entries: { create: { shareholderId: holderA.id, shares: 100 } },
      },
    });
    const tx2 = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdAt: new Date("2013-11-01T00:00:00Z"),
        createdById: "seed-admin",
        entries: { create: { shareholderId: holderB.id, shares: 50 } },
      },
    });
    const tx3 = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdAt: new Date("2014-01-01T00:00:00Z"),
        createdById: "seed-admin",
        entries: { create: { shareholderId: holderA.id, shares: 300 } },
      },
    });
    createdTransactionIds.push(tx1.id, tx2.id, tx3.id);

    const groups = await getContributionsByYear();

    const y2013 = groups.find((g) => g.year === 2013)!;
    expect(y2013).toBeDefined();
    expect(y2013.total.toString()).toBe("150");
    const y2013Shares = y2013.purchases
      .filter((p) => [holderA.id, holderB.id].includes(p.shareholderId))
      .map((p) => p.shares.toString())
      .sort();
    expect(y2013Shares).toEqual(["100", "50"]);

    const y2014 = groups.find((g) => g.year === 2014)!;
    expect(y2014).toBeDefined();
    expect(y2014.total.toString()).toBe("300");
    expect(
      y2014.purchases.some((p) => p.shareholderId === holderA.id && p.shares.toString() === "300"),
    ).toBe(true);
  });

  it("Income & Expenses by Year: matches hand-computed income (contributions) vs. expenses per year", async () => {
    const holder = await testDb.shareholder.create({
      data: { name: `Income Expense Holder ${Date.now()}`, email: `ie-${Date.now()}@example.com` },
    });
    createdShareholderIds.push(holder.id);

    // Income: 2015 => 200, 2016 => 75.
    const tx1 = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdAt: new Date("2015-06-01T00:00:00Z"),
        createdById: "seed-admin",
        entries: { create: { shareholderId: holder.id, shares: 200 } },
      },
    });
    const tx2 = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdAt: new Date("2016-06-01T00:00:00Z"),
        createdById: "seed-admin",
        entries: { create: { shareholderId: holder.id, shares: 75 } },
      },
    });
    createdTransactionIds.push(tx1.id, tx2.id);

    // Expenses: 2015 => 40 + 10 = 50, 2016 => 0 (none recorded).
    const exp1 = await testDb.expense.create({
      data: {
        description: `IE Expense 1 ${Date.now()}`,
        amount: 40,
        category: "REPAIRS",
        incurredAt: new Date("2015-04-01T00:00:00Z"),
        createdByUserId: "seed-admin",
      },
    });
    const exp2 = await testDb.expense.create({
      data: {
        description: `IE Expense 2 ${Date.now()}`,
        amount: 10,
        category: "UTILITIES",
        capital: true,
        incurredAt: new Date("2015-09-01T00:00:00Z"),
        createdByUserId: "seed-admin",
      },
    });
    createdExpenseIds.push(exp1.id, exp2.id);

    const contributionsByYear = await getContributionsByYear();
    const incomeExpenses = await getIncomeExpensesByYear(contributionsByYear);

    const y2015 = incomeExpenses.find((y) => y.year === 2015)!;
    expect(y2015).toBeDefined();
    expect(y2015.income.toString()).toBe("200");
    expect(y2015.expenses.toString()).toBe("50");

    const y2016 = incomeExpenses.find((y) => y.year === 2016)!;
    expect(y2016).toBeDefined();
    expect(y2016.income.toString()).toBe("75");
    expect(y2016.expenses.toString()).toBe("0");
  });
});
