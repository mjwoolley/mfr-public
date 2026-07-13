import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAggregate = vi.fn();
const mockGroupBy = vi.fn();
const mockFindMany = vi.fn();
const mockLedgerEntryFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ledgerEntry: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
      findMany: (...args: unknown[]) => mockLedgerEntryFindMany(...args),
    },
    shareholder: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const {
  getShareholderBalance,
  getTotalSharesOutstanding,
  getAllShareholderBalances,
  getContributionsByYear,
  groupContributionsByYear,
} = await import("@/lib/ledger");
const { Prisma } = await import("@/generated/prisma/client");
const { Decimal } = Prisma;

beforeEach(() => {
  mockAggregate.mockReset();
  mockGroupBy.mockReset();
  mockFindMany.mockReset();
  mockLedgerEntryFindMany.mockReset();
});

describe("getShareholderBalance", () => {
  it("sums ledger entries for a shareholder", async () => {
    mockAggregate.mockResolvedValue({ _sum: { shares: new Decimal(150) } });
    const balance = await getShareholderBalance("sh_1");
    expect(balance.toString()).toBe("150");
  });

  it("returns zero when there are no entries", async () => {
    mockAggregate.mockResolvedValue({ _sum: { shares: null } });
    const balance = await getShareholderBalance("sh_1");
    expect(balance.toString()).toBe("0");
  });
});

describe("getTotalSharesOutstanding", () => {
  it("reflects a transfer netting to zero against contributions", async () => {
    // Contribution +300, contribution +100, transfer -50/+50 => total 400
    mockAggregate.mockResolvedValue({ _sum: { shares: new Decimal(400) } });
    const total = await getTotalSharesOutstanding();
    expect(total.toString()).toBe("400");
  });
});

describe("getAllShareholderBalances", () => {
  it("computes per-shareholder percent ownership that sums to 100%", async () => {
    mockFindMany.mockResolvedValue([
      { id: "alice", name: "Alice Miller", active: true },
      { id: "bob", name: "Bob Miller", active: true },
    ]);
    mockGroupBy.mockResolvedValue([
      { shareholderId: "alice", _sum: { shares: new Decimal(250) } },
      { shareholderId: "bob", _sum: { shares: new Decimal(150) } },
    ]);
    mockAggregate.mockResolvedValue({ _sum: { shares: new Decimal(400) } });

    const { rows, total } = await getAllShareholderBalances();

    expect(total.toString()).toBe("400");
    const alice = rows.find((r) => r.shareholder.id === "alice")!;
    const bob = rows.find((r) => r.shareholder.id === "bob")!;
    expect(alice.shares.toString()).toBe("250");
    expect(alice.percent.toFixed(2)).toBe("62.50");
    expect(bob.shares.toString()).toBe("150");
    expect(bob.percent.toFixed(2)).toBe("37.50");

    const sumPct = rows.reduce((acc, r) => acc + Number(r.percent), 0);
    expect(sumPct).toBeCloseTo(100, 5);
  });

  it("does not divide by zero when nothing has been contributed yet", async () => {
    mockFindMany.mockResolvedValue([{ id: "carl", name: "Carl Miller", active: true }]);
    mockGroupBy.mockResolvedValue([]);
    mockAggregate.mockResolvedValue({ _sum: { shares: null } });

    const { rows, total } = await getAllShareholderBalances();
    expect(total.toString()).toBe("0");
    expect(rows[0].shares.toString()).toBe("0");
    expect(rows[0].percent.toString()).toBe("0");
  });

  it("gives a shareholder with no ledger entries a zero balance, not undefined", async () => {
    mockFindMany.mockResolvedValue([
      { id: "alice", name: "Alice Miller", active: true },
      { id: "dave", name: "Dave Miller", active: true },
    ]);
    mockGroupBy.mockResolvedValue([{ shareholderId: "alice", _sum: { shares: new Decimal(100) } }]);
    mockAggregate.mockResolvedValue({ _sum: { shares: new Decimal(100) } });

    const { rows } = await getAllShareholderBalances();
    const dave = rows.find((r) => r.shareholder.id === "dave")!;
    expect(dave.shares.toString()).toBe("0");
    expect(dave.percent.toString()).toBe("0");
  });
});

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

describe("getContributionsByYear", () => {
  it("queries only CONTRIBUTION-type ledger entries, joined with transaction + shareholder", async () => {
    mockLedgerEntryFindMany.mockResolvedValue([
      {
        shareholderId: "carl",
        shares: new Decimal(75),
        shareholder: { name: "Carl Miller" },
        transaction: { createdAt: new Date("2023-06-01") },
      },
    ]);

    const groups = await getContributionsByYear();

    expect(mockLedgerEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transaction: { type: "CONTRIBUTION", deleted: false } },
        include: { transaction: true, shareholder: true },
      }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].year).toBe(2023);
    expect(groups[0].total.toString()).toBe("75");
  });
});
