'use server'

// Content-admin server actions for the portal DB: the reunion schedule and
// sharing links (portal_settings singleton), photo-album rows, and events.
// All gated by requirePortalContentAdmin (site owner or manager). User/role
// management is separate and stricter — see admin/users/actions.ts.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { portalDb } from '@/lib/portalDb'
import { portalSettings, portalEvents } from '@/lib/db/schema'
import { requirePortalContentAdmin } from '@/lib/authz'

export type ActionResult = { ok: true } | { error: string }

// Content edits show up on Home / Photos / Meals, so revalidate them all.
function revalidatePublic() {
  revalidatePath('/')
  revalidatePath('/photos')
  revalidatePath('/meals')
  revalidatePath('/admin')
}

// ── Reunion schedule + links (the settings singleton) ────────────────────────

const scheduleSchema = z.object({
  reunionYear: z.coerce.number().int().min(2000).max(2100),
  reunionStart: z.string().trim().optional(),
  reunionEnd: z.string().trim().optional(),
})

export async function saveSchedule(input: z.input<typeof scheduleSchema>): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const parsed = scheduleSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data
  const set = {
    reunionYear: d.reunionYear,
    reunionStart: d.reunionStart || null,
    reunionEnd: d.reunionEnd || null,
    updatedAt: new Date(),
  }
  // Upsert so it self-seeds the singleton and updates only these columns.
  await portalDb
    .insert(portalSettings)
    .values({ id: 'singleton', ...set })
    .onConflictDoUpdate({ target: portalSettings.id, set })
  revalidatePublic()
  return { ok: true }
}

const linksSchema = z.object({
  driveUrl: z.string().trim(),
  venmoUrl: z.string().trim(),
  chatUrl: z.string().trim(),
})

export async function saveLinks(input: z.input<typeof linksSchema>): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const parsed = linksSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const set = { ...parsed.data, updatedAt: new Date() }
  await portalDb
    .insert(portalSettings)
    .values({ id: 'singleton', ...set })
    .onConflictDoUpdate({ target: portalSettings.id, set })
  revalidatePublic()
  return { ok: true }
}

// ── Upcoming events ──────────────────────────────────────────────────────────

export async function addEvent(): Promise<ActionResult> {
  await requirePortalContentAdmin()
  await portalDb.insert(portalEvents).values({})
  revalidatePublic()
  return { ok: true }
}

const eventSchema = z.object({
  id: z.string().uuid(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  time: z.string().trim().optional(),
  description: z.string().trim().optional(),
  meetingLink: z.string().trim().optional(),
})

export async function updateEvent(input: z.input<typeof eventSchema>): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { id, ...fields } = parsed.data
  const startDate = fields.startDate || null
  const endDate = fields.endDate || null
  // A range needs its end on/after its start; ignore a stray end otherwise.
  if (startDate && endDate && endDate < startDate) {
    return { error: 'End date must be on or after the start date.' }
  }
  // A time only applies to a single day — clear it when a range is set.
  const isRange = !!(startDate && endDate)
  await portalDb
    .update(portalEvents)
    .set({
      startDate,
      endDate,
      time: isRange ? '' : (fields.time ?? ''),
      description: fields.description ?? '',
      meetingLink: fields.meetingLink || null,
    })
    .where(eq(portalEvents.id, id))
  revalidatePublic()
  return { ok: true }
}

export async function removeEvent(input: { id: string }): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const id = z.string().uuid().safeParse(input.id)
  if (!id.success) return { error: 'Invalid event' }
  await portalDb.delete(portalEvents).where(eq(portalEvents.id, id.data))
  revalidatePublic()
  return { ok: true }
}
