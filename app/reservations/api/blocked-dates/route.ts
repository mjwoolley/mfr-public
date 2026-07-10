import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { blockedDates } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/requireApprovedUser'

export async function GET() {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const rows = await db.select().from(blockedDates)
  return NextResponse.json({ blockedDates: rows })
}
