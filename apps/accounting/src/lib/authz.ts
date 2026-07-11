import { auth } from "@/lib/auth";
import { createPortalStatusGate } from "@mfr/auth";
import { redirect } from "next/navigation";

// Accounting's portal-status gate: no session -> sign-in, pending -> pending
// page, blocked -> blocked page. Same branch-on-status logic reservations
// uses (via its own lib/auth/portalStatusGate.ts), just configured with
// accounting's own paths.
const gatePortalStatus = createPortalStatusGate({
  loginPath: "/accounting/sign-in",
  pendingPath: "/accounting/pending",
  blockedPath: "/accounting/blocked",
});

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/accounting/sign-in");
  return session;
}

/**
 * Portal-wide approval gate. Every other helper layers on top of this, so a
 * pending/blocked user never reaches the shareholder/admin logic. This is the
 * shared cross-app gate (the same `status` governs the reservations app too) —
 * an added prerequisite in front of accounting's own authorization, not a
 * replacement for it.
 */
export async function requirePortalApproved() {
  const session = await requireSession();
  return gatePortalStatus(session);
}

/** Admin, or an unlinked-but-allowed account. Redirects unauthorized users away. */
export async function requireAuthorized() {
  const session = await requirePortalApproved();
  const { isAccountingAdmin, shareholderId } = session.user;
  if (!isAccountingAdmin && !shareholderId) redirect("/accounting/unauthorized");
  return session;
}

export async function requireAdmin() {
  const session = await requirePortalApproved();
  if (!session.user.isAccountingAdmin) redirect("/accounting/unauthorized");
  return session;
}

/** A signed-in, linked shareholder (admins are not necessarily shareholders). */
export async function requireShareholder() {
  const session = await requirePortalApproved();
  if (!session.user.shareholderId) redirect("/accounting/unauthorized");
  return session as typeof session & { user: { shareholderId: string } };
}
