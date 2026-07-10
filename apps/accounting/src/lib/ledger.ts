import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

export async function getShareholderBalance(shareholderId: string): Promise<Decimal> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { shareholderId },
    _sum: { shares: true },
  });
  return result._sum.shares ?? new Decimal(0);
}

export async function getTotalSharesOutstanding(): Promise<Decimal> {
  const result = await prisma.ledgerEntry.aggregate({
    _sum: { shares: true },
  });
  return result._sum.shares ?? new Decimal(0);
}

export async function getAllShareholderBalances() {
  const [shareholders, grouped, total] = await Promise.all([
    prisma.shareholder.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.ledgerEntry.groupBy({ by: ["shareholderId"], _sum: { shares: true } }),
    getTotalSharesOutstanding(),
  ]);

  const balanceByShareholder = new Map(
    grouped.map((g) => [g.shareholderId, g._sum.shares ?? new Decimal(0)]),
  );

  const rows = shareholders.map((s) => {
    const shares = balanceByShareholder.get(s.id) ?? new Decimal(0);
    const percent = total.isZero() ? new Decimal(0) : shares.div(total).mul(100);
    return { shareholder: s, shares, percent };
  });

  return { rows, total };
}
