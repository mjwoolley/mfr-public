import { requireApprovedUser } from './requireApprovedUser'
import type { AuthResult } from './requireUser'

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Grants access to the shared portal-wide Users admin screen/API to either
 * admin type — approving/blocking portal access isn't a financial-trust
 * decision. Callers that mutate isReservationsAdmin/isAccountingAdmin must
 * still separately check the actor has the specific flag they're trying to
 * grant (see app/reservations/api/admin/users/[id]/route.ts) — this gate
 * only confirms the actor is *some* kind of portal admin.
 */
export async function requirePortalAdmin(): Promise<AuthResult> {
  const result = await requireApprovedUser()
  if (!result.ok) return result
  if (!result.session.user.isReservationsAdmin && !result.session.user.isAccountingAdmin) {
    return { ok: false, response: jsonError(403, 'Forbidden') }
  }
  return result
}
