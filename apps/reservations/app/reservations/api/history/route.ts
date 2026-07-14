import { NextResponse } from 'next/server'
import { and, eq, gte, inArray, lt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reservations } from '@/lib/db/schema'
import { users } from '@mfr/auth'
import { identityDb } from '@/lib/auth/identityDb'
import { requireApprovedUser } from '@/lib/auth/requireApprovedUser'

function currentYearRange() {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString().slice(0, 10)
  return { from, to }
}

export async function GET() {
  const auth = await requireApprovedUser()
  if (!auth.ok) return auth.response

  const { from, to } = currentYearRange()

  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      status: reservations.status,
    })
    .from(reservations)
    // Reservation Summary (Phase 9) shows confirmed stays only — cancelled
    // reservations are excluded here rather than client-side, since this is
    // a purpose-built endpoint for the summary page. Also scoped to the
    // current calendar year (by start date) so the summary doesn't grow
    // unbounded with every past reunion.
    .where(
      and(
        eq(reservations.status, 'confirmed'),
        gte(reservations.startDate, from),
        lt(reservations.startDate, to),
      ),
    )

  // users lives in the separate shared identity database now — no SQL-level
  // JOIN is possible across databases, so resolve names with a second query
  // and merge in application code.
  const userIds = [...new Set(rows.map((r) => r.userId))]
  const userRows =
    userIds.length > 0
      ? await identityDb
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : []
  const nameById = new Map(userRows.map((u) => [u.id, u.name]))

  const withNames = rows.map((r) => ({ ...r, userName: nameById.get(r.userId) ?? null }))

  return NextResponse.json({ reservations: withNames })
}
