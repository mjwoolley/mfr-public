import { prisma } from "@/lib/prisma";
import { Prisma, TransactionType } from "@/generated/prisma/client";

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

// ---------- Contributions by Year (Phase 13 — Reports) ----------

export type ContributionPurchase = {
  shareholderId: string;
  shareholderName: string;
  date: Date;
  shares: Decimal;
};

export type ContributionYearGroup = {
  year: number;
  total: Decimal;
  purchases: ContributionPurchase[];
};

/** The shape `getContributionsByYear`'s query fetches — kept narrow so the
 * pure grouping function below is easy to unit test with plain fixtures. */
type ContributionEntryForGrouping = {
  shareholderId: string;
  shares: Decimal;
  shareholder: { name: string };
  transaction: { createdAt: Date };
};

/**
 * Groups CONTRIBUTION ledger entries by the calendar year of their
 * transaction's `createdAt`. Pure/synchronous so it can be unit tested
 * against fixture data without touching Prisma — mirrors the fetch-then-
 * group-in-JS pattern used throughout this app for aggregations Prisma's
 * `groupBy` can't express directly (grouping by a year extracted from a
 * joined table's DateTime column).
 */
export function groupContributionsByYear(
  entries: ContributionEntryForGrouping[],
): ContributionYearGroup[] {
  const byYear = new Map<number, ContributionYearGroup>();

  for (const entry of entries) {
    // getUTCFullYear (not getFullYear) so grouping is deterministic
    // regardless of the host machine's local timezone — dev boxes, CI, and
    // Vercel's UTC runtime shouldn't disagree on which year a timestamp near
    // midnight falls in.
    const year = entry.transaction.createdAt.getUTCFullYear();
    let group = byYear.get(year);
    if (!group) {
      group = { year, total: new Decimal(0), purchases: [] };
      byYear.set(year, group);
    }
    group.total = group.total.add(entry.shares);
    group.purchases.push({
      shareholderId: entry.shareholderId,
      shareholderName: entry.shareholder.name,
      date: entry.transaction.createdAt,
      shares: entry.shares,
    });
  }

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

export async function getContributionsByYear(): Promise<ContributionYearGroup[]> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { transaction: { type: TransactionType.CONTRIBUTION } },
    include: { transaction: true, shareholder: true },
  });
  return groupContributionsByYear(entries);
}
