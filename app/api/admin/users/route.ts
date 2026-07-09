import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const rows = status
    ? await db.select().from(users).where(eq(users.status, status as 'pending' | 'approved' | 'blocked'))
    : await db.select().from(users)

  return NextResponse.json({ users: rows })
}
