// Member-visible read of the booking-rules singleton (row id=1, enforced by
// a DB CHECK); the calendar runs client-side validation against these.

import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { bookingRules } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/requireApprovedUser'

export async function GET() {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const [rules] = await db.select().from(bookingRules).where(eq(bookingRules.id, 1))
  return NextResponse.json({ bookingRules: rules ?? null })
}
