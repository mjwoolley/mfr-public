import { auth } from './config'

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>

export type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; response: Response }

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function requireUser(): Promise<AuthResult> {
  const session = await auth()
  if (!session?.user) {
    return { ok: false, response: jsonError(401, 'Unauthorized') }
  }
  return { ok: true, session }
}
