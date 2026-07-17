// DB-backed lib helpers that the unit suites can't reach: the app-settings
// singleton upsert, the current-fiscal-year raised total, and the goal lookup.
import { describe, it, expect, afterEach } from "vitest";
import { testDb } from "./testDb";
import { getAppSettings } from "@/lib/settings";
import { getRaisedThisYear } from "@/lib/ledger";
import { getContributionGoal } from "@/lib/goals";
import { currentFiscalYear } from "@/lib/fiscalYear";
import { TransactionType } from "@/generated/prisma/client";

// A far-past year no other fixture uses (adminSettings.test.ts uses 2001).
const GOAL_TEST_YEAR = 1999;

const createdShareholderIds: string[] = [];
const createdTransactionIds: string[] = [];

afterEach(async () => {
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {});
  }
  createdTransactionIds.length = 0;
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {});
  }
  createdShareholderIds.length = 0;
  await testDb.contributionGoal.delete({ where: { year: GOAL_TEST_YEAR } }).catch(() => {});
});

describe("getAppSettings", () => {
  it("upsert-reads the singleton row (fresh DB gets defaults on first touch)", async () => {
    const settings = await getAppSettings();
    expect(settings.id).toBe("singleton");
    expect(typeof settings.contributionsVisibleToAll).toBe("boolean");

    // Second read returns the same row, not a duplicate.
    const again = await getAppSettings();
    expect(again.id).toBe("singleton");
  });
});

describe("getRaisedThisYear", () => {
  it("sums current-fiscal-year contributions ($1 = 1 share), excluding deleted", async () => {
    const shareholder = await testDb.shareholder.create({
      data: { name: `Raised Fixture ${Date.now()}`, email: null },
    });
    createdShareholderIds.push(shareholder.id);

    const live = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: "admin-1",
        entries: { create: { shareholderId: shareholder.id, shares: 77 } },
      },
    });
    createdTransactionIds.push(live.id);
    // A soft-deleted contribution must NOT count.
    const deleted = await testDb.transaction.create({
      data: {
        type: TransactionType.CONTRIBUTION,
        createdById: "admin-1",
        deleted: true,
        deletedAt: new Date(),
        entries: { create: { shareholderId: shareholder.id, shares: 1000 } },
      },
    });
    createdTransactionIds.push(deleted.id);

    const before = await getRaisedThisYear();
    expect(before.year).toBe(currentFiscalYear());
    // Other suites write contributions concurrently, so assert the floor and
    // that the deleted 1000 didn't leak in via our own fixtures' delta.
    expect(before.raised).toBeGreaterThanOrEqual(77);

    const mine = await testDb.ledgerEntry.aggregate({
      where: { shareholderId: shareholder.id, transaction: { deleted: false } },
      _sum: { shares: true },
    });
    expect(Number(mine._sum.shares)).toBe(77);
  });
});

describe("getContributionGoal", () => {
  it("returns the configured goal for a year and null when unset", async () => {
    expect(await getContributionGoal(GOAL_TEST_YEAR)).toBeNull();

    await testDb.contributionGoal.create({
      data: { year: GOAL_TEST_YEAR, amount: 5000 },
    });
    const goal = await getContributionGoal(GOAL_TEST_YEAR);
    expect(Number(goal?.amount)).toBe(5000);
  });
});
