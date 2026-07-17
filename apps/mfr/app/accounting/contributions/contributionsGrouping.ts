/**
 * Pure grouping for the Contributions transparency tab: the same ledger
 * entries shaped two ways (per shareholder / per year), plus the
 * contributions-only per-year totals behind the "Shares sold by year" bars.
 * Plain-number rows so the groupings are unit-testable and serializable to
 * the client toggle component. Years are fiscal years (see @/lib/fiscalYear).
 */

import { fiscalYear } from "@/lib/accounting/fiscalYear";

/** Fiscal year of an entry's ISO date string. */
const rowFiscalYear = (row: ContributionEntryRow): number => fiscalYear(new Date(row.date));

export interface ContributionEntryRow {
  shareholderId: string;
  shareholderName: string;
  /** TransactionType name — kept as a string so this stays Prisma-free. */
  type: string;
  /** ISO date string of the transaction. */
  date: string;
  description: string | null;
  /** Signed dollars (= shares). */
  amount: number;
  /** Soft-deleted (superseded by a correction) — shown struck through, excluded from all totals. */
  deleted: boolean;
}

export interface ShareholderBalanceRow {
  shareholderId: string;
  name: string;
  balance: number;
  /** Ownership percent, 0–100. */
  pct: number;
}

export interface ShareholderGroup extends ShareholderBalanceRow {
  /** Total of CONTRIBUTION entries only. */
  contributed: number;
  entries: ContributionEntryRow[];
}

export interface YearGroup {
  year: number;
  /** CONTRIBUTION total for the year ("$X in new shares"). */
  newShares: number;
  entries: ContributionEntryRow[];
}

const byDateDesc = (a: ContributionEntryRow, b: ContributionEntryRow) => (a.date < b.date ? 1 : -1);

export function contributionTotalsByYear(rows: ContributionEntryRow[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const row of rows) {
    if (row.type !== "CONTRIBUTION" || row.deleted) continue;
    const year = rowFiscalYear(row);
    totals.set(year, (totals.get(year) ?? 0) + row.amount);
  }
  return totals;
}

/** One group per shareholder (ordered by balance, largest first), each with
 * every ledger entry of theirs, newest first. */
export function groupEntriesByShareholder(
  rows: ContributionEntryRow[],
  balances: ShareholderBalanceRow[],
): ShareholderGroup[] {
  return [...balances]
    .sort((a, b) => b.balance - a.balance)
    .map((b) => {
      const entries = rows.filter((r) => r.shareholderId === b.shareholderId).sort(byDateDesc);
      const contributed = entries
        .filter((r) => r.type === "CONTRIBUTION" && !r.deleted)
        .reduce((sum, r) => sum + r.amount, 0);
      return { ...b, contributed, entries };
    });
}

/** One group per fiscal year (newest year first), entries newest first. */
export function groupEntriesByYear(rows: ContributionEntryRow[]): YearGroup[] {
  const contributionTotals = contributionTotalsByYear(rows);
  const years = Array.from(new Set(rows.map(rowFiscalYear))).sort((a, b) => b - a);
  return years.map((year) => ({
    year,
    newShares: contributionTotals.get(year) ?? 0,
    entries: rows.filter((r) => rowFiscalYear(r) === year).sort(byDateDesc),
  }));
}
