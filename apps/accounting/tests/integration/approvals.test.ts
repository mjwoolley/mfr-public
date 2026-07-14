import { describe, it, expect, afterEach, vi } from "vitest";
import { testDb } from "./testDb";

// Same reasoning as harness.test.ts / shareholders.test.ts for mocking
// @/lib/auth: requireShareholder()/requireAdmin() call auth() from
// @/lib/auth, whose top-level NextAuth(...) call would otherwise
// instantiate real next-auth machinery that doesn't resolve under plain
// Vitest.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// revalidatePath() throws a "static generation store missing" invariant
// when called outside a real Next.js request — mock it out so only the
// actions' own logic is under test (same as shareholders.test.ts).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Avoid real Resend network calls from createCorrection's notification emails.
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }));

import { auth } from "@/lib/auth";
import { confirmTransaction, disputeTransaction, resolveDispute } from "@/actions/approvals";
import { createCorrection } from "@/actions/corrections";
import { ApprovalStatus, TransactionType } from "@/generated/prisma/client";

function shareholderSession(shareholderId: string) {
  return {
    user: {
      id: `user-for-${shareholderId}`,
      status: "approved",
      isAccountingAdmin: false,
      isReservationsAdmin: false,
      shareholderId,
      email: "shareholder@example.com",
    },
    expires: "2099-01-01",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const ADMIN_SESSION = {
  user: {
    id: "admin-1",
    status: "approved",
    isAccountingAdmin: true,
    isReservationsAdmin: false,
    shareholderId: null,
    email: "admin@example.com",
    name: "Admin",
  },
  expires: "2099-01-01",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const createdShareholderIds: string[] = [];
const createdTransactionIds: string[] = [];

async function makeShareholderWithPendingApproval(namePrefix: string) {
  const shareholder = await testDb.shareholder.create({
    data: { name: `${namePrefix} ${Date.now()}-${Math.random()}`, email: null },
  });
  createdShareholderIds.push(shareholder.id);

  const transaction = await testDb.transaction.create({
    data: {
      type: TransactionType.CONTRIBUTION,
      createdById: "admin-1",
      createdByName: "Admin",
      entries: { create: { shareholderId: shareholder.id, shares: "100" } },
      approvals: { create: { shareholderId: shareholder.id } },
    },
    include: { approvals: true },
  });
  createdTransactionIds.push(transaction.id);

  return { shareholder, transaction, approval: transaction.approvals[0] };
}

afterEach(async () => {
  vi.mocked(auth).mockReset();
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {});
  }
  createdTransactionIds.length = 0;
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {});
  }
  createdShareholderIds.length = 0;
});

describe("confirmTransaction", () => {
  it("transitions the owning shareholder's own PENDING approval to CONFIRMED", async () => {
    const { shareholder, approval } = await makeShareholderWithPendingApproval("Confirmer");
    vi.mocked(auth).mockResolvedValue(shareholderSession(shareholder.id));

    await confirmTransaction(approval.id);

    const updated = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(updated.status).toBe(ApprovalStatus.CONFIRMED);
    expect(updated.confirmedAt).not.toBeNull();
  });

  it("does not let a different shareholder confirm someone else's approval (self-scoping)", async () => {
    const { shareholder, approval } = await makeShareholderWithPendingApproval("Owner");
    const intruder = await testDb.shareholder.create({
      data: { name: `Intruder ${Date.now()}`, email: null },
    });
    createdShareholderIds.push(intruder.id);

    vi.mocked(auth).mockResolvedValue(shareholderSession(intruder.id));
    await confirmTransaction(approval.id);

    const stillPending = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(stillPending.status).toBe(ApprovalStatus.PENDING);
    expect(stillPending.confirmedAt).toBeNull();
    void shareholder;
  });
});

describe("disputeTransaction", () => {
  it("sets status/disputedAt/disputeReason together on the owner's own PENDING approval", async () => {
    const { shareholder, approval } = await makeShareholderWithPendingApproval("Disputer");
    vi.mocked(auth).mockResolvedValue(shareholderSession(shareholder.id));

    await disputeTransaction(approval.id, "This amount looks wrong");

    const updated = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(updated.status).toBe(ApprovalStatus.DISPUTED);
    expect(updated.disputedAt).not.toBeNull();
    expect(updated.disputeReason).toBe("This amount looks wrong");
  });

  it("rejects an empty/whitespace-only reason", async () => {
    const { shareholder, approval } = await makeShareholderWithPendingApproval("EmptyReason");
    vi.mocked(auth).mockResolvedValue(shareholderSession(shareholder.id));

    await expect(disputeTransaction(approval.id, "   ")).rejects.toThrow(/reason/i);

    const unchanged = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(unchanged.status).toBe(ApprovalStatus.PENDING);
  });

  it("does not let a different shareholder dispute someone else's approval (self-scoping)", async () => {
    const { shareholder, approval } = await makeShareholderWithPendingApproval("Owner2");
    const intruder = await testDb.shareholder.create({
      data: { name: `Intruder2 ${Date.now()}`, email: null },
    });
    createdShareholderIds.push(intruder.id);

    vi.mocked(auth).mockResolvedValue(shareholderSession(intruder.id));
    await disputeTransaction(approval.id, "Not mine to dispute");

    const stillPending = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(stillPending.status).toBe(ApprovalStatus.PENDING);
    expect(stillPending.disputeReason).toBeNull();
    void shareholder;
  });
});

describe("resolveDispute — admin-only", () => {
  it("rejects a non-admin caller", async () => {
    const { shareholder, approval } = await makeShareholderWithPendingApproval("NonAdminResolve");
    vi.mocked(auth).mockResolvedValue(shareholderSession(shareholder.id));
    await disputeTransaction(approval.id, "Needs a look");

    // Now attempt to resolve as the same (non-admin) shareholder session.
    await expect(resolveDispute(approval.id)).rejects.toThrow();

    const stillDisputed = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(stillDisputed.status).toBe(ApprovalStatus.DISPUTED);
    expect(stillDisputed.resolvedAt).toBeNull();
  });

  it("allows an admin to mark a dispute resolved without a correction (false alarm)", async () => {
    const { shareholder, approval } = await makeShareholderWithPendingApproval("FalseAlarm");
    vi.mocked(auth).mockResolvedValue(shareholderSession(shareholder.id));
    await disputeTransaction(approval.id, "Turned out to be fine");

    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    await resolveDispute(approval.id);

    const resolved = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(resolved.status).toBe(ApprovalStatus.DISPUTED);
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolutionTransactionId).toBeNull();
  });
});

describe("full dispute -> correction -> resolved lifecycle", () => {
  it("keeps status DISPUTED (never reverts to CONFIRMED) with resolvedAt and resolutionTransactionId set", async () => {
    const { shareholder, transaction, approval } =
      await makeShareholderWithPendingApproval("Lifecycle");

    // 1. Shareholder disputes the original transaction.
    vi.mocked(auth).mockResolvedValue(shareholderSession(shareholder.id));
    await disputeTransaction(approval.id, "Amount is off by $50");

    const disputed = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(disputed.status).toBe(ApprovalStatus.DISPUTED);

    // 2. Admin issues a correction referencing the original transaction.
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const correctionResult = await createCorrection(
      undefined,
      fd({
        originalTransactionId: transaction.id,
        description: "Fixing the disputed amount",
        [`amount_${shareholder.id}`]: "-50",
      }),
    );
    expect(correctionResult?.success).toBe(true);

    const correction = await testDb.transaction.findFirstOrThrow({
      where: { correctsTransactionId: transaction.id },
    });
    createdTransactionIds.push(correction.id);

    // 3. Admin marks the dispute resolved, referencing the correction.
    await resolveDispute(approval.id, correction.id);

    // 4. Final state: DISPUTED, not CONFIRMED — resolvedAt and
    // resolutionTransactionId both set, preserving the audit trail.
    const final = await testDb.transactionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(final.status).toBe(ApprovalStatus.DISPUTED);
    expect(final.resolvedAt).not.toBeNull();
    expect(final.resolutionTransactionId).toBe(correction.id);
  });
});
