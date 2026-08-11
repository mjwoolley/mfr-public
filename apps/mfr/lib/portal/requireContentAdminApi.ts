// API-route guard for portal-admin endpoints: approved user AND portal
// content-admin capability (site owner or site manager). The JSON-error
// mirror of lib/authz's redirect-based requirePortalContentAdmin, for
// fetch() consumers — modeled on lib/reservations/auth/requireReservationsAdmin.

import { canManagePortalContent } from '@mfr/auth'
import { requireApprovedUser } from '@/lib/reservations/auth/requireApprovedUser'
import type { AuthResult } from '@/lib/reservations/auth/requireUser'

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function requireContentAdminApi(): Promise<AuthResult> {
  const result = await requireApprovedUser()
  if (!result.ok) return result
  if (!canManagePortalContent(result.session.user.roles)) {
    return { ok: false, response: jsonError(403, 'Forbidden') }
  }
  return result
}
