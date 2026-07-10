import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reservations, users } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/requireApprovedUser'

export async function GET() {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      userName: users.name,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      status: reservations.status,
    })
    .from(reservations)
    .innerJoin(users, eq(reservations.userId, users.id))

  return NextResponse.json({ reservations: rows })
}
