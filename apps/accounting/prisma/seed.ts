import { PrismaClient } from "../src/generated/prisma/client";
import { ExpenseCategory } from "../src/generated/prisma/enums";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_ADMIN = {
  createdByUserId: "seed",
  createdByName: "Seed script",
  createdByEmail: null,
};

async function main() {
  const alice = await prisma.shareholder.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: { name: "Alice Miller", email: "alice@example.com" },
  });
  const bob = await prisma.shareholder.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: { name: "Bob Miller", email: "bob@example.com" },
  });

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const currentYear = new Date().getUTCFullYear();
  await prisma.contributionGoal.upsert({
    where: { year: currentYear },
    update: {},
    create: { year: currentYear, amount: 12000 },
  });

  // Dev-only sample expenses across a couple of years — a mix of operating
  // and capital so the income/expense chart and expense log render locally.
  // Idempotent via the fixed descriptions below.
  const sampleExpenses = [
    {
      description: "Roof & deck repair",
      amount: 5200,
      category: ExpenseCategory.REPAIRS,
      capital: true,
      incurredAt: new Date(Date.UTC(currentYear, 5, 20)),
    },
    {
      description: "Property tax — Rutherford County",
      amount: 3400,
      category: ExpenseCategory.TAXES,
      capital: false,
      incurredAt: new Date(Date.UTC(currentYear, 2, 15)),
    },
    {
      description: "Homeowner's insurance (annual)",
      amount: 2150,
      category: ExpenseCategory.INSURANCE,
      capital: false,
      incurredAt: new Date(Date.UTC(currentYear, 1, 1)),
    },
    {
      description: "Dock rebuild",
      amount: 9800,
      category: ExpenseCategory.IMPROVEMENTS,
      capital: true,
      incurredAt: new Date(Date.UTC(currentYear - 1, 8, 5)),
    },
    {
      description: "Propane fill",
      amount: 780,
      category: ExpenseCategory.UTILITIES,
      capital: false,
      incurredAt: new Date(Date.UTC(currentYear - 1, 10, 10)),
    },
    {
      description: "New mattresses (x4)",
      amount: 2200,
      category: ExpenseCategory.FURNISHINGS,
      capital: false,
      incurredAt: new Date(Date.UTC(currentYear - 2, 9, 2)),
    },
  ];

  for (const expense of sampleExpenses) {
    const existing = await prisma.expense.findFirst({
      where: { description: expense.description, incurredAt: expense.incurredAt },
    });
    if (!existing) {
      await prisma.expense.create({ data: { ...expense, ...SEED_ADMIN } });
    }
  }

  console.log(
    "Seeded shareholders:",
    alice.name,
    bob.name,
    `· settings + ${currentYear} goal + sample expenses`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
