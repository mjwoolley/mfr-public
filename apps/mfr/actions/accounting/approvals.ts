"use server";

// Shareholder-facing approval workflow (confirm/dispute from the inbox) plus
// the admin-side resolveDispute. Approval is informational — it never blocks a
// transaction from counting toward balances. Every mutation is scoped to the
// caller's own approval row via updateMany filters, not checked-then-updated.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/accounting/prisma";
import { requireShareholder, requireAdmin } from "@/lib/accounting/authz";
import { ApprovalStatus } from "@/generated/prisma/client";

export async function confirmTransaction(approvalId: string) {
  const session = await requireShareholder();

  // Scope the update to the current shareholder's own approval row so nobody
  // can confirm on another shareholder's behalf via a crafted request.
  // Accepts PENDING (normal inbox confirm) or DISPUTED (a shareholder
  // deciding, after the fact, that a transaction they'd disputed is fine
  // after all) — this shareholder-initiated path is distinct from admin's
  // resolveDispute below, which never reverts status away from DISPUTED.
  await prisma.transactionApproval.updateMany({
    where: {
      id: approvalId,
      shareholderId: session.user.shareholderId,
      status: { in: [ApprovalStatus.PENDING, ApprovalStatus.DISPUTED] },
    },
    data: { status: ApprovalStatus.CONFIRMED, confirmedAt: new Date() },
  });

  revalidatePath("/accounting/inbox");
  revalidatePath("/accounting/admin/activity");
  revalidatePath("/accounting/dashboard");
}

export async function disputeTransaction(approvalId: string, reason: string) {
  const session = await requireShareholder();

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A reason is required to dispute a transaction");
  }

  // Same self-scoping pattern as confirmTransaction — only the owning
  // shareholder can dispute their own approval row, and only from PENDING.
  await prisma.transactionApproval.updateMany({
    where: {
      id: approvalId,
      shareholderId: session.user.shareholderId,
      status: ApprovalStatus.PENDING,
    },
    data: {
      status: ApprovalStatus.DISPUTED,
      disputedAt: new Date(),
      disputeReason: trimmedReason,
    },
  });

  revalidatePath("/accounting/inbox");
  revalidatePath("/accounting/admin/activity");
  revalidatePath("/accounting/dashboard");
}

export async function updateDisputeReason(approvalId: string, reason: string) {
  const session = await requireShareholder();

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A reason is required to dispute a transaction");
  }

  // Same self-scoping pattern as disputeTransaction — only the owning
  // shareholder can edit their own dispute's reason, and only while it's
  // still an open dispute.
  await prisma.transactionApproval.updateMany({
    where: {
      id: approvalId,
      shareholderId: session.user.shareholderId,
      status: ApprovalStatus.DISPUTED,
    },
    data: { disputeReason: trimmedReason },
  });

  revalidatePath("/accounting/admin/activity");
  revalidatePath("/accounting/dashboard");
}

/**
 * Admin-only. Marks a disputed approval as handled — either because a
 * correction was issued (resolutionTransactionId provided) or because the
 * dispute turned out to be a false alarm (no correction needed). A dispute
 * never silently reverts to CONFIRMED: status stays DISPUTED with
 * resolvedAt/resolutionTransactionId now set, preserving the audit trail.
 */
export async function resolveDispute(approvalId: string, resolutionTransactionId?: string) {
  await requireAdmin();

  await prisma.transactionApproval.updateMany({
    where: {
      id: approvalId,
      status: ApprovalStatus.DISPUTED,
    },
    data: {
      resolvedAt: new Date(),
      resolutionTransactionId: resolutionTransactionId?.trim() || null,
    },
  });

  revalidatePath("/accounting/admin/activity");
}
