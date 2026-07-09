import { requireApprovedUser } from './requireApprovedUser'
import type { AuthResult } from './requireUser'

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireApprovedUser()
  if (!result.ok) return result
  if (!result.session.user.isAdmin) {
    return { ok: false, response: jsonError(403, 'Forbidden') }
  }
  return result
}
