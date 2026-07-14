import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/auth/identityDb'
import { requirePortalAdmin } from '@/lib/auth/requirePortalAdmin'

export async function GET(request: NextRequest) {
  const auth = await requirePortalAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const rows = status
    ? await identityDb
        .select()
        .from(users)
        .where(eq(users.status, status as 'pending' | 'approved' | 'blocked'))
    : await identityDb.select().from(users)

  return NextResponse.json({ users: rows })
}
