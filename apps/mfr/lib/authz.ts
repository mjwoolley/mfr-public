import { redirect } from 'next/navigation'
import { createPortalStatusGate, canManageUsers, canManagePortalContent } from '@mfr/auth'
import { auth } from '@/lib/auth'

// The portal's gate ladder, mirroring accounting's lib/authz.ts. The portal is
// itself the sign-in surface, so login goes to its own /sign-in; a
// pending/blocked user is bounced to the public home for now (dedicated
// pending/blocked pages can come later).
const gatePortalStatus = createPortalStatusGate({
  loginPath: '/sign-in',
  pendingPath: '/',
  blockedPath: '/',
})

/** Any approved, signed-in member. */
export async function requireApproved() {
  return gatePortalStatus(await auth())
}

/** Portal content admin: reunion schedule, photo albums, events, meals (PR 2). */
export async function requirePortalContentAdmin() {
  const session = await requireApproved()
  if (!canManagePortalContent(session.user.roles)) redirect('/')
  return session
}

/** User management — site owner only. */
export async function requireSiteOwner() {
  const session = await requireApproved()
  if (!canManageUsers(session.user.roles)) redirect('/')
  return session
}
