// API-route guard for admin endpoints: approved user AND reservations-admin
// capability (site owner or site manager — portal roles, see @mfr/auth).

import { canAdminReservations } from '@mfr/auth'
import { requireApprovedUser } from './requireApprovedUser'
import type { AuthResult } from './requireUser'

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function requireReservationsAdmin(): Promise<AuthResult> {
  const result = await requireApprovedUser()
  if (!result.ok) return result
  if (!canAdminReservations(result.session.user.roles)) {
    return { ok: false, response: jsonError(403, 'Forbidden') }
  }
  return result
}
