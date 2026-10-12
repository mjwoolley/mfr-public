// Requirements coverage for CAP-008 Site settings (requirements/portal/site-settings.md)
// against the real portal DB. Same mock trio as portalContent.test.ts: auth()
// impersonates each role, redirect() throws, revalidatePath is a no-op.
// Downstream readers (home Venmo, nav Family Chat, Documents folder, home
// events) all read through getPortalSettings/getEvents, which is what is
// re-read here; their rendering is covered by app/page.requirements.test.tsx
// and app/layout.requirements.test.tsx.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { auth } from '@/lib/auth'
import { portalDb } from '@/lib/portalDb'
import { portalEvents } from '@/lib/db/schema'
import { saveSchedule, saveLinks, addEvent, updateEvent, removeEvent } from '@/app/admin/actions'
import { getPortalSettings, getEvents } from '@/lib/portal'

const session = (roles: { siteOwner?: boolean; siteManager?: boolean }) => ({
  user: {
    id: randomUUID(),
    status: 'approved',
    roles: {
      siteOwner: roles.siteOwner ?? false,
      siteManager: roles.siteManager ?? false,
      accountingManager: false,
    },
  },
  expires: '2099-01-01',
})
const asManager = () => vi.mocked(auth).mockResolvedValue(session({ siteManager: true }) as never)
const asMember = () => vi.mocked(auth).mockResolvedValue(session({}) as never)

const createdEventIds: string[] = []

/** addEvent() returns no id; the new row is the one not seen before. */
async function addEventAsManager() {
  const before = new Set((await portalDb.select().from(portalEvents)).map((e) => e.id))
  asManager()
  await addEvent()
  const after = await portalDb.select().from(portalEvents)
  const created = after.find((e) => !before.has(e.id))!
  createdEventIds.push(created.id)
  return created
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  if (createdEventIds.length) {
    await portalDb.delete(portalEvents).where(inArray(portalEvents.id, createdEventIds))
    createdEventIds.length = 0
  }
})

describe('CAP-008 · The reunion year must be between 2000 and 2100', () => {
  it.each([
    [1999, 'refused'],
    [2000, 'saved'],
    [2100, 'saved'],
    [2101, 'refused'],
  ] as const)('year %i is %s', async (year, result) => {
    asManager()
    // Known baseline so a refusal is observable as "unchanged".
    await saveSchedule({ reunionYear: 2026, reunionStart: '', reunionEnd: '' })

    const res = await saveSchedule({ reunionYear: year })
    const settings = await getPortalSettings()
    if (result === 'saved') {
      expect(res).toEqual({ ok: true })
      expect(settings.reunionYear).toBe(year)
    } else {
      expect(res).toMatchObject({ error: expect.any(String) })
      expect(settings.reunionYear).toBe(2026)
    }
  })
})

describe('CAP-008 · Saving family links', () => {
  it('saves the Drive folder, Family Venmo and Family Chat links that Documents, Home and the nav read', async () => {
    asManager()
    const res = await saveLinks({
      driveUrl: 'https://drive.google.com/drive/folders/REQ-FOLDER',
      venmoUrl: 'https://venmo.com/u/Req-Family',
      chatUrl: 'https://chat.google.com/room/REQ',
    })
    expect(res).toEqual({ ok: true })
    const settings = await getPortalSettings()
    expect(settings.driveUrl).toBe('https://drive.google.com/drive/folders/REQ-FOLDER')
    expect(settings.venmoUrl).toBe('https://venmo.com/u/Req-Family')
    expect(settings.chatUrl).toBe('https://chat.google.com/room/REQ')
  })
})

describe('CAP-008 · Adding and editing an event', () => {
  it('a saved event appears in the home page’s events, listed by start date', async () => {
    const later = await addEventAsManager()
    const earlier = await addEventAsManager()
    asManager()
    await updateEvent({
      id: later.id,
      startDate: '2099-08-02',
      description: 'Req later event',
      meetingLink: 'https://teams.example/j/1',
    })
    await updateEvent({ id: earlier.id, startDate: '2099-08-01', description: 'Req earlier event' })

    const events = await getEvents()
    const mine = events.filter((e) => e.id === later.id || e.id === earlier.id)
    expect(mine.map((e) => e.description)).toEqual(['Req earlier event', 'Req later event'])
    expect(mine[1].meetingLink).toBe('https://teams.example/j/1')
  })
})

describe('CAP-008 · An event cannot end before it starts', () => {
  it('is refused with the message and the event is not changed', async () => {
    const ev = await addEventAsManager()
    asManager()
    await updateEvent({ id: ev.id, startDate: '2099-07-05', description: 'Unchanged' })

    const res = await updateEvent({
      id: ev.id,
      startDate: '2099-07-05',
      endDate: '2099-07-01',
      description: 'Changed',
    })
    expect(res).toEqual({ error: 'End date must be on or after the start date.' })
    const [row] = await portalDb.select().from(portalEvents).where(eq(portalEvents.id, ev.id))
    expect(row.description).toBe('Unchanged')
    expect(row.endDate).toBeNull()
  })
})

describe('CAP-008 · Removing an event', () => {
  it('disappears from the events the home page reads', async () => {
    const ev = await addEventAsManager()
    asManager()
    await removeEvent({ id: ev.id })
    expect((await getEvents()).some((e) => e.id === ev.id)).toBe(false)
  })
})

describe('CAP-008 · Members cannot change settings behind the screens', () => {
  it('schedule, links and every event action are refused and nothing is saved', async () => {
    asManager()
    await saveSchedule({ reunionYear: 2031, reunionStart: '2031-07-01', reunionEnd: '2031-07-05' })
    await saveLinks({
      driveUrl: 'https://drive.example/keep',
      venmoUrl: 'https://venmo.example/keep',
      chatUrl: 'https://chat.example/keep',
    })
    const ev = await addEventAsManager()
    asManager()
    await updateEvent({ id: ev.id, startDate: '2031-07-04', description: 'Keep me' })
    const eventCountBefore = (await portalDb.select().from(portalEvents)).length

    asMember()
    await expect(saveSchedule({ reunionYear: 2040 })).rejects.toThrow('REDIRECT:/')
    await expect(
      saveLinks({ driveUrl: 'x', venmoUrl: 'https://evil.example', chatUrl: 'x' }),
    ).rejects.toThrow('REDIRECT:/')
    await expect(addEvent()).rejects.toThrow('REDIRECT:/')
    await expect(updateEvent({ id: ev.id, description: 'Hijacked' })).rejects.toThrow('REDIRECT:/')
    await expect(removeEvent({ id: ev.id })).rejects.toThrow('REDIRECT:/')

    const settings = await getPortalSettings()
    expect(settings.reunionYear).toBe(2031)
    expect(settings.reunionStart).toBe('2031-07-01')
    expect(settings.venmoUrl).toBe('https://venmo.example/keep')
    expect(settings.driveUrl).toBe('https://drive.example/keep')
    expect(settings.chatUrl).toBe('https://chat.example/keep')
    expect((await portalDb.select().from(portalEvents)).length).toBe(eventCountBefore)
    const [row] = await portalDb.select().from(portalEvents).where(eq(portalEvents.id, ev.id))
    expect(row.description).toBe('Keep me')
  })
})
