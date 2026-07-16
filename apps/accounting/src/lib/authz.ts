import { auth } from "@/lib/auth";
import { createPortalStatusGate, canAdminAccounting } from "@mfr/auth";
import { portalSignInUrl } from "@mfr/ui";
import { redirect } from "next/navigation";

// The portal is the single sign-in surface: signed-out users are sent there
// with a callbackUrl that brings them back to accounting afterwards.
export const ACCOUNTING_SIGN_IN_URL = portalSignInUrl(process.env.APP_BASE_URL ?? "/accounting");

// Accounting's portal-status gate: no session -> portal sign-in, pending ->
// pending page, blocked -> blocked page. Same branch-on-status logic
// reservations uses, just configured with accounting's own paths.
const gatePortalStatus = createPortalStatusGate({
  loginPath: ACCOUNTING_SIGN_IN_URL,
  pendingPath: "/accounting/pending",
  blockedPath: "/accounting/blocked",
});

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect(ACCOUNTING_SIGN_IN_URL);
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
  if (!canAdminAccounting(session.user.roles) && !session.user.shareholderId) {
    redirect("/accounting/unauthorized");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requirePortalApproved();
  // Accounting admin = the "accounting manager" role (or site owner). Roles are
  // the source of truth now; the legacy `isAccountingAdmin` column is kept only
  // as a backfill source until a follow-up cleanup drops it.
  if (!canAdminAccounting(session.user.roles)) redirect("/accounting/unauthorized");
  return session;
}

/** A signed-in, linked shareholder (admins are not necessarily shareholders). */
export async function requireShareholder() {
  const session = await requirePortalApproved();
  if (!session.user.shareholderId) redirect("/accounting/unauthorized");
  return session as typeof session & { user: { shareholderId: string } };
}
