import type { Session } from 'next-auth'
import { redirect } from 'next/navigation'

export interface PortalStatusGatePaths {
  /** Redirect target when there is no session at all. */
  loginPath: string
  /** Redirect target when `status === 'pending'`. */
  pendingPath: string
  /** Redirect target when `status === 'blocked'`. */
  blockedPath: string
}

/**
 * Builds the portal-wide "is this user allowed in" gate: no session -> login,
 * pending -> pending page, blocked -> blocked page, otherwise the session is
 * returned with `status === 'approved'` guaranteed. This is the one place the
 * branch-on-`status` redirect logic lives — every app's own gating helper
 * (reservations' layout/root-page checks, accounting's `requirePortalApproved`)
 * calls into this rather than re-implementing the branches.
 *
 * `redirect()` throws internally (standard Next.js Server
 * Component/Server Action behavior), so the `null`/`pending`/`blocked`
 * branches never fall through to the return below.
 */
export function createPortalStatusGate({ loginPath, pendingPath, blockedPath }: PortalStatusGatePaths) {
  return function gatePortalStatus(session: Session | null): Session {
    if (!session?.user) {
      redirect(loginPath)
    }

    if (session.user.status === 'pending') {
      redirect(pendingPath)
    }

    if (session.user.status === 'blocked') {
      redirect(blockedPath)
    }

    return session
  }
}
