import { auth } from '@/lib/auth'
import { createPortalStatusGate, canAdminAccounting } from '@mfr/auth'
import { redirect } from 'next/navigation'

// One origin now: the local /sign-in page is the single sign-in surface;
// signed-out users are sent there with a callbackUrl back to accounting.
export const ACCOUNTING_SIGN_IN_URL = `/sign-in?callbackUrl=${encodeURIComponent('/accounting')}`

// Accounting's portal-status gate: no session -> portal sign-in, pending ->
// pending page, blocked -> blocked page. Same branch-on-status logic
// reservations uses, just configured with accounting's own paths.
const gatePortalStatus = createPortalStatusGate({
  loginPath: ACCOUNTING_SIGN_IN_URL,
  pendingPath: '/accounting/pending',
  blockedPath: '/accounting/blocked',
})

export async function requireSession() {
  const session = await auth()
  if (!session?.user) redirect(ACCOUNTING_SIGN_IN_URL)
  return session
}

/**
 * Portal-wide approval gate. Every other helper layers on top of this, so a
 * pending/blocked user never reaches the shareholder/admin logic. This is the
 * shared cross-app gate (the same `status` governs the reservations app too) —
 * an added prerequisite in front of accounting's own authorization, not a
 * replacement for it.
 */
export async function requirePortalApproved() {
  const session = await requireSession()
  return gatePortalStatus(session)
}

/**
 * The books are open to the whole family: any approved portal user can read the
 * shared accounting views (share purchases, ownership, expenses), whether or not
 * they're linked to a Shareholder record. Being a shareholder is what gives you
 * a *personal* view — see `requireShareholder` for those.
 *
 * Kept as its own name (rather than calling `requirePortalApproved` directly at
 * the call sites) because "who may read the books" is a distinct policy that has
 * changed once already and may change again.
 */
export async function requireAuthorized() {
  return requirePortalApproved()
}

export async function requireAdmin() {
  const session = await requirePortalApproved()
  // Accounting admin = the "accounting manager" role (or site owner). Roles are
  // the source of truth now; the legacy `isAccountingAdmin` column is kept only
  // as a backfill source until a follow-up cleanup drops it.
  if (!canAdminAccounting(session.user.roles)) redirect('/accounting/unauthorized')
  return session
}

/** A signed-in, linked shareholder (admins are not necessarily shareholders). */
export async function requireShareholder() {
  const session = await requirePortalApproved()
  if (!session.user.shareholderId) redirect('/accounting/unauthorized')
  return session as typeof session & { user: { shareholderId: string } }
}
