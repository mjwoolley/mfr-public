import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExpenseFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    expense: {
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
    },
  },
}));

const { groupExpensesByYear, getExpensesByYear, mergeIncomeAndExpenses, splitExpensesByYear } =
  await import("@/lib/expenses");
const { Prisma } = await import("@/generated/prisma/client");
const { Decimal } = Prisma;

beforeEach(() => {
  mockExpenseFindMany.mockReset();
});

describe("groupExpensesByYear", () => {
  it("groups expenses by the calendar year of incurredAt", () => {
    const expenses = [
      { amount: new Decimal(40), incurredAt: new Date("2024-02-01") },
      { amount: new Decimal(10), incurredAt: new Date("2024-09-01") },
      { amount: new Decimal(300), incurredAt: new Date("2025-04-01") },
    ];

    const groups = groupExpensesByYear(expenses);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ year: 2024 });
    expect(groups[0].total.toString()).toBe("50");
    expect(groups[1]).toMatchObject({ year: 2025 });
    expect(groups[1].total.toString()).toBe("300");
  });

  it("returns an empty array when there are no expenses", () => {
    expect(groupExpensesByYear([])).toEqual([]);
  });
});

describe("splitExpensesByYear", () => {
  it("splits each year's total into operating vs capital by the capital flag", () => {
    const expenses = [
      { amount: new Decimal(40), incurredAt: new Date("2024-02-01"), capital: false },
      { amount: new Decimal(10), incurredAt: new Date("2024-09-01"), capital: true },
      { amount: new Decimal(5), incurredAt: new Date("2024-11-01"), capital: true },
      { amount: new Decimal(300), incurredAt: new Date("2025-04-01"), capital: false },
    ];

    const groups = splitExpensesByYear(expenses);

    expect(groups).toHaveLength(2);
    expect(groups[0].year).toBe(2024);
    expect(groups[0].operating.toString()).toBe("40");
    expect(groups[0].capital.toString()).toBe("15");
    expect(groups[1].year).toBe(2025);
    expect(groups[1].operating.toString()).toBe("300");
    expect(groups[1].capital.toString()).toBe("0");
  });

  it("returns an empty array when there are no expenses", () => {
    expect(splitExpensesByYear([])).toEqual([]);
  });
});

describe("getExpensesByYear", () => {
  it("fetches all expenses and groups them by year", async () => {
    mockExpenseFindMany.mockResolvedValue([
      { amount: new Decimal(500), incurredAt: new Date("2022-01-01") },
    ]);

    const groups = await getExpensesByYear();

    expect(mockExpenseFindMany).toHaveBeenCalled();
    expect(groups).toEqual([{ year: 2022, total: expect.any(Decimal) }]);
    expect(groups[0].total.toString()).toBe("500");
  });
});

describe("mergeIncomeAndExpenses", () => {
  it("combines per-year income and expense totals, keyed by year", () => {
    const contributionsByYear = [
      { year: 2024, total: new Decimal(150), purchases: [] },
      { year: 2025, total: new Decimal(200), purchases: [] },
    ];
    const expensesByYear = [
      { year: 2024, total: new Decimal(50) },
      { year: 2026, total: new Decimal(20) },
    ];

    const merged = mergeIncomeAndExpenses(contributionsByYear, expensesByYear);

    expect(merged).toEqual([
      { year: 2024, income: expect.any(Decimal), expenses: expect.any(Decimal) },
      { year: 2025, income: expect.any(Decimal), expenses: expect.any(Decimal) },
      { year: 2026, income: expect.any(Decimal), expenses: expect.any(Decimal) },
    ]);

    const y2024 = merged.find((m) => m.year === 2024)!;
    expect(y2024.income.toString()).toBe("150");
    expect(y2024.expenses.toString()).toBe("50");

    // A year with contributions but no expenses gets a zero expense total,
    // not undefined.
    const y2025 = merged.find((m) => m.year === 2025)!;
    expect(y2025.income.toString()).toBe("200");
    expect(y2025.expenses.toString()).toBe("0");

    // A year with expenses but no contributions gets a zero income total.
    const y2026 = merged.find((m) => m.year === 2026)!;
    expect(y2026.income.toString()).toBe("0");
    expect(y2026.expenses.toString()).toBe("20");
  });

  it("returns an empty array when there are no contributions or expenses", () => {
    expect(mergeIncomeAndExpenses([], [])).toEqual([]);
  });
});
