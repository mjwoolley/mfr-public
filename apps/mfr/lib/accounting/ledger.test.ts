import { describe, it, expect } from "vitest";
import { groupContributionsByYear } from "@/lib/accounting/ledger";
import { Decimal } from "@/lib/accounting/decimal";

// The DB-backed ledger functions (getShareholderBalance, getTotalSharesOutstanding,
// getAllShareholderBalances, getContributionsByYear) are exercised against a real
// Neon test branch by the integration suite (tests/accounting-integration/
// reports.test.ts + libDb.test.ts) and cross-checked against production in the
// migration verification — not mocked here, since Drizzle query shape isn't a
// meaningful unit assertion. This file keeps the pure fiscal-year grouping.

describe("groupContributionsByYear", () => {
  it("groups entries by the fiscal year of their transaction's createdAt", () => {
    const entries = [
      {
        shareholderId: "alice",
        shares: new Decimal(100),
        shareholder: { name: "Alice Miller" },
        transaction: { createdAt: new Date("2024-03-01") }, // FY2024 (Mar)
      },
      {
        shareholderId: "bob",
        shares: new Decimal(50),
        shareholder: { name: "Bob Miller" },
        transaction: { createdAt: new Date("2024-11-15") }, // FY2024 (Nov)
      },
      {
        shareholderId: "dave",
        shares: new Decimal(30),
        shareholder: { name: "Dave Miller" },
        transaction: { createdAt: new Date("2025-02-20") }, // Feb rolls back → FY2024
      },
      {
        shareholderId: "alice",
        shares: new Decimal(200),
        shareholder: { name: "Alice Miller" },
        transaction: { createdAt: new Date("2025-04-10") }, // FY2025 (Apr)
      },
    ];

    const groups = groupContributionsByYear(entries);

    expect(groups).toHaveLength(2);
    // Sorted ascending by fiscal year.
    expect(groups[0].year).toBe(2024);
    expect(groups[1].year).toBe(2025);

    const y2024 = groups[0];
    expect(y2024.total.toString()).toBe("180"); // 100 + 50 + 30 (the Feb entry)
    expect(y2024.purchases).toHaveLength(3);

    const y2025 = groups[1];
    expect(y2025.total.toString()).toBe("200");
    expect(y2025.purchases).toHaveLength(1);
    expect(y2025.purchases[0].shareholderName).toBe("Alice Miller");
    expect(y2025.purchases[0].shares.toString()).toBe("200");
  });

  it("returns an empty array when there are no contributions", () => {
    expect(groupContributionsByYear([])).toEqual([]);
  });
});
