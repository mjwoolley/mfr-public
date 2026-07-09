import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAggregate = vi.fn();
const mockGroupBy = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ledgerEntry: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
    shareholder: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const { getShareholderBalance, getTotalSharesOutstanding, getAllShareholderBalances } =
  await import("@/lib/ledger");
const { Prisma } = await import("@/generated/prisma/client");
const { Decimal } = Prisma;

beforeEach(() => {
  mockAggregate.mockReset();
  mockGroupBy.mockReset();
  mockFindMany.mockReset();
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
