import { requireUser, type AuthResult } from './requireUser'

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function requireApprovedUser(): Promise<AuthResult> {
  const result = await requireUser()
  if (!result.ok) return result
  if (result.session.user.status !== 'approved') {
    return { ok: false, response: jsonError(403, 'Forbidden') }
  }
  return result
}
