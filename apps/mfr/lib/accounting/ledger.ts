import { db } from "@/lib/db/client";
import { ledgerEntry, transaction, shareholder } from "@/lib/db/schema";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { Decimal } from "@/lib/accounting/decimal";
import { TransactionType } from "@/lib/accounting/enums";
import { fiscalYear, currentFiscalYear, fiscalYearRange } from "@/lib/accounting/fiscalYear";

/**
 * Total dollars contributed in the current fiscal year ($1 = 1 share, so the
 * share sum is the dollar amount). Extracted from the dashboard's inline
 * aggregate so the portal's fundraising API can reuse the exact same query.
 */
export async function getRaisedThisYear(): Promise<{ year: number; raised: number }> {
  const year = currentFiscalYear();
  const { start, end } = fiscalYearRange(year);
  const [aggregate] = await db
    .select({ sum: sql<string>`coalesce(sum(${ledgerEntry.shares}), 0)` })
    .from(ledgerEntry)
    .innerJoin(transaction, eq(transaction.id, ledgerEntry.transactionId))
    .where(
      and(
        eq(transaction.type, TransactionType.CONTRIBUTION),
        gte(transaction.createdAt, start),
        lt(transaction.createdAt, end),
        eq(transaction.deleted, false),
      ),
    );
  return { year, raised: Number(aggregate.sum ?? 0) };
}

export async function getShareholderBalance(shareholderId: string): Promise<Decimal> {
  const [result] = await db
    .select({ sum: sql<string>`coalesce(sum(${ledgerEntry.shares}), 0)` })
    .from(ledgerEntry)
    .innerJoin(transaction, eq(transaction.id, ledgerEntry.transactionId))
    .where(and(eq(ledgerEntry.shareholderId, shareholderId), eq(transaction.deleted, false)));
  return new Decimal(result.sum);
}

export async function getTotalSharesOutstanding(): Promise<Decimal> {
  const [result] = await db
    .select({ sum: sql<string>`coalesce(sum(${ledgerEntry.shares}), 0)` })
    .from(ledgerEntry)
    .innerJoin(transaction, eq(transaction.id, ledgerEntry.transactionId))
    .where(eq(transaction.deleted, false));
  return new Decimal(result.sum);
}

export async function getAllShareholderBalances() {
  const [shareholders, grouped, total] = await Promise.all([
    db.query.shareholder.findMany({
      where: eq(shareholder.active, true),
      orderBy: (s, { asc }) => [asc(s.name)],
    }),
    db
      .select({
        shareholderId: ledgerEntry.shareholderId,
        sum: sql<string>`coalesce(sum(${ledgerEntry.shares}), 0)`,
      })
      .from(ledgerEntry)
      .innerJoin(transaction, eq(transaction.id, ledgerEntry.transactionId))
      .where(eq(transaction.deleted, false))
      .groupBy(ledgerEntry.shareholderId),
    getTotalSharesOutstanding(),
  ]);

  const balanceByShareholder = new Map(
    grouped.map((g) => [g.shareholderId, new Decimal(g.sum)]),
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
 * Groups CONTRIBUTION ledger entries by the fiscal year of their
 * transaction's `createdAt` (see @/lib/fiscalYear). Pure/synchronous so it
 * can be unit tested against fixture data without touching the DB — mirrors
 * the fetch-then-group-in-JS pattern used throughout this app for
 * aggregations SQL `GROUP BY` can't express directly (grouping by a year
 * extracted from a joined table's DateTime column). The `year` field holds
 * the fiscal year.
 */
export function groupContributionsByYear(
  entries: ContributionEntryForGrouping[],
): ContributionYearGroup[] {
  const byYear = new Map<number, ContributionYearGroup>();

  for (const entry of entries) {
    const year = fiscalYear(entry.transaction.createdAt);
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
  const rows = await db
    .select({
      shareholderId: ledgerEntry.shareholderId,
      shares: ledgerEntry.shares,
      shareholderName: shareholder.name,
      createdAt: transaction.createdAt,
    })
    .from(ledgerEntry)
    .innerJoin(transaction, eq(transaction.id, ledgerEntry.transactionId))
    .innerJoin(shareholder, eq(shareholder.id, ledgerEntry.shareholderId))
    .where(
      and(
        eq(transaction.type, TransactionType.CONTRIBUTION),
        eq(transaction.deleted, false),
      ),
    );

  const entries: ContributionEntryForGrouping[] = rows.map((r) => ({
    shareholderId: r.shareholderId,
    shares: new Decimal(r.shares),
    shareholder: { name: r.shareholderName },
    transaction: { createdAt: r.createdAt },
  }));

  return groupContributionsByYear(entries);
}
