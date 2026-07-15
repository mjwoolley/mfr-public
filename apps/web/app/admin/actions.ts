'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { portalDb } from '@/lib/portalDb'
import { portalSettings, portalPhotoAlbums, portalEvents } from '@/lib/db/schema'
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
  highlightsUrl: z.string().trim(),
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

// ── Photo album links ────────────────────────────────────────────────────────

export async function addAlbumYear(): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const rows = await portalDb.select({ year: portalPhotoAlbums.year }).from(portalPhotoAlbums)
  const nextYear = rows.length ? Math.max(...rows.map((r) => r.year)) + 1 : new Date().getFullYear()
  await portalDb.insert(portalPhotoAlbums).values({ year: nextYear, url: '' }).onConflictDoNothing()
  revalidatePublic()
  return { ok: true }
}

const albumUrlSchema = z.object({ id: z.string().uuid(), url: z.string().trim() })

export async function setAlbumUrl(input: z.input<typeof albumUrlSchema>): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const parsed = albumUrlSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  await portalDb
    .update(portalPhotoAlbums)
    .set({ url: parsed.data.url, updatedAt: new Date() })
    .where(eq(portalPhotoAlbums.id, parsed.data.id))
  revalidatePublic()
  return { ok: true }
}

export async function removeAlbum(input: { id: string }): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const id = z.string().uuid().safeParse(input.id)
  if (!id.success) return { error: 'Invalid album' }
  await portalDb.delete(portalPhotoAlbums).where(eq(portalPhotoAlbums.id, id.data))
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
  date: z.string().trim().optional(),
  time: z.string().trim().optional(),
  description: z.string().trim().optional(),
  meetingLink: z.string().trim().optional(),
})

export async function updateEvent(input: z.input<typeof eventSchema>): Promise<ActionResult> {
  await requirePortalContentAdmin()
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { id, ...fields } = parsed.data
  await portalDb
    .update(portalEvents)
    .set({
      date: fields.date || null,
      time: fields.time ?? '',
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
