import { describe, expect, it } from "vitest";
import {
  contributionTotalsByYear,
  groupEntriesByShareholder,
  groupEntriesByYear,
  type ContributionEntryRow,
  type ShareholderBalanceRow,
} from "./contributionsGrouping";

// Years below are FISCAL years (Mar–Feb). Note Bob's 2024-02-01 contribution
// falls in February, so it rolls back into FY2023 — proof the grouping uses
// the fiscal year, not the calendar year.
const rows: ContributionEntryRow[] = [
  { shareholderId: "a", shareholderName: "Alice", type: "CONTRIBUTION", date: "2024-07-01T00:00:00.000Z", description: "Buy-in", amount: 12000, deleted: false }, // FY2024
  { shareholderId: "b", shareholderName: "Bob", type: "CONTRIBUTION", date: "2024-02-01T00:00:00.000Z", description: null, amount: 3000, deleted: false }, // Feb → FY2023
  { shareholderId: "a", shareholderName: "Alice", type: "ADJUSTMENT", date: "2025-04-02T00:00:00.000Z", description: "Reconcile", amount: 500, deleted: false },
  { shareholderId: "b", shareholderName: "Bob", type: "TRANSFER", date: "2025-05-15T00:00:00.000Z", description: "Gift", amount: -2000, deleted: false },
  { shareholderId: "a", shareholderName: "Alice", type: "TRANSFER", date: "2025-05-15T00:00:00.000Z", description: "Gift", amount: 2000, deleted: false },
  { shareholderId: "a", shareholderName: "Alice", type: "CONTRIBUTION", date: "2025-09-10T00:00:00.000Z", description: "Dock", amount: 6000, deleted: false },
];

const balances: ShareholderBalanceRow[] = [
  { shareholderId: "b", name: "Bob", balance: 1000, pct: 4.6 },
  { shareholderId: "a", name: "Alice", balance: 20500, pct: 95.4 },
];

describe("contributionTotalsByYear", () => {
  it("sums CONTRIBUTION entries only, per fiscal year", () => {
    const totals = contributionTotalsByYear(rows);
    expect(totals.get(2023)).toBe(3000); // Bob's Feb-2024 contribution rolls into FY2023
    expect(totals.get(2024)).toBe(12000);
    expect(totals.get(2025)).toBe(6000); // adjustment + transfers excluded
  });

  it("excludes deleted (corrected) entries from the total", () => {
    const withDeleted: ContributionEntryRow[] = [
      ...rows,
      { shareholderId: "a", shareholderName: "Alice", type: "CONTRIBUTION", date: "2025-11-01T00:00:00.000Z", description: "Corrected out", amount: 9000, deleted: true },
    ];
    const totals = contributionTotalsByYear(withDeleted);
    expect(totals.get(2025)).toBe(6000);
  });
});

describe("groupEntriesByShareholder", () => {
  it("orders by balance descending and includes every entry type, newest first", () => {
    const groups = groupEntriesByShareholder(rows, balances);
    expect(groups.map((g) => g.name)).toEqual(["Alice", "Bob"]);

    const alice = groups[0];
    expect(alice.contributed).toBe(18000); // 12000 + 6000, transfers/adjustments excluded
    expect(alice.entries).toHaveLength(4);
    expect(alice.entries[0].date).toBe("2025-09-10T00:00:00.000Z");
  });

  it("keeps a shareholder with no entries (zero contributed)", () => {
    const groups = groupEntriesByShareholder([], balances);
    expect(groups).toHaveLength(2);
    expect(groups[0].contributed).toBe(0);
    expect(groups[0].entries).toEqual([]);
  });

  it("keeps a deleted (corrected) entry visible in the list but excludes it from contributed", () => {
    const withDeleted: ContributionEntryRow[] = [
      ...rows,
      { shareholderId: "a", shareholderName: "Alice", type: "CONTRIBUTION", date: "2025-11-01T00:00:00.000Z", description: "Corrected out", amount: 9000, deleted: true },
    ];
    const groups = groupEntriesByShareholder(withDeleted, balances);
    const alice = groups[0];
    expect(alice.contributed).toBe(18000); // unchanged — deleted entry excluded
    expect(alice.entries).toHaveLength(5); // still visible in the list
  });
});

describe("groupEntriesByYear", () => {
  it("groups the same entries by fiscal year, newest year first, with contribution totals", () => {
    const groups = groupEntriesByYear(rows);
    expect(groups.map((g) => g.year)).toEqual([2025, 2024, 2023]);
    expect(groups[0].newShares).toBe(6000); // FY2025: adjustment + transfers + $6k contribution
    expect(groups[0].entries).toHaveLength(4);
    expect(groups[1].newShares).toBe(12000); // FY2024: Alice's buy-in
    expect(groups[1].entries).toHaveLength(1);
    expect(groups[2].newShares).toBe(3000); // FY2023: Bob's Feb-2024 contribution
    expect(groups[2].entries).toHaveLength(1);
  });

  it("shows the same total entry count as the by-shareholder view", () => {
    const byYear = groupEntriesByYear(rows).reduce((n, g) => n + g.entries.length, 0);
    const byShareholder = groupEntriesByShareholder(rows, balances).reduce(
      (n, g) => n + g.entries.length,
      0,
    );
    expect(byYear).toBe(rows.length);
    expect(byShareholder).toBe(rows.length);
  });
});
