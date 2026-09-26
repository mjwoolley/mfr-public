// Requirements coverage (CAP-015 Photo details): updatePhoto validation
// boundaries and permission checks against the real database, re-reading the
// row to prove what was (and was not) saved.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './testDb'
import { portalPhotos, activityLog } from '../../lib/db/schema'
import { ME, OTHER, mockUser, seedPhoto } from './requirementsHelpers'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@/lib/auth'
import { updatePhoto } from '../../app/photos/actions'

afterEach(async () => {
  vi.mocked(auth).mockReset()
  await testDb.delete(portalPhotos)
  await testDb.delete(activityLog)
})

async function reread(id: string) {
  const [row] = await testDb.select().from(portalPhotos).where(eq(portalPhotos.id, id))
  return row
}

describe('CAP-015 Photo details — updatePhoto', () => {
  describe('CAP-015 · The year must be between 1900 and 2200', () => {
    it.each([1899, 2201])(
      'CAP-015 · The year must be between 1900 and 2200 — %i is refused and nothing is saved',
      async (year) => {
        mockUser(ME)
        const row = await seedPhoto({ year: 2026, caption: 'Keep me' })
        expect(await updatePhoto(row.id, { year, caption: 'Changed' })).toEqual({
          error: 'Invalid changes',
        })
        const after = await reread(row.id)
        expect(after.year).toBe(2026)
        expect(after.caption).toBe('Keep me')
      },
    )

    it.each([1900, 2200])(
      'CAP-015 · The year must be between 1900 and 2200 — %i is saved',
      async (year) => {
        mockUser(ME)
        const row = await seedPhoto({ year: 2026 })
        expect(await updatePhoto(row.id, { year })).toEqual({ ok: true })
        expect((await reread(row.id)).year).toBe(year)
      },
    )
  })

  describe('CAP-015 · A caption can be up to 500 characters', () => {
    it('CAP-015 · A caption can be up to 500 characters — 500 is saved', async () => {
      mockUser(ME)
      const row = await seedPhoto()
      const caption = 'a'.repeat(500)
      expect(await updatePhoto(row.id, { caption })).toEqual({ ok: true })
      expect((await reread(row.id)).caption).toBe(caption)
    })

    it('CAP-015 · A caption can be up to 500 characters — 501 is refused and nothing is saved', async () => {
      mockUser(ME)
      const row = await seedPhoto({ caption: 'Before' })
      expect(await updatePhoto(row.id, { caption: 'a'.repeat(501) })).toEqual({
        error: 'Invalid changes',
      })
      expect((await reread(row.id)).caption).toBe('Before')
    })
  })

  it('CAP-015 · Clearing a caption removes it', async () => {
    mockUser(ME)
    const row = await seedPhoto({ caption: 'Dock jump' })
    expect(await updatePhoto(row.id, { year: 2026, caption: '' })).toEqual({ ok: true })
    // Stored empty — the gallery shows no caption for an empty one.
    expect((await reread(row.id)).caption ?? '').toBe('')
  })

  it('CAP-015 · I cannot change another member’s photo by going around the screens', async () => {
    mockUser(ME)
    const row = await seedPhoto({ uploadedBy: OTHER, caption: 'Theirs', year: 2020 })
    expect(await updatePhoto(row.id, { caption: 'Hijacked', year: 2021 })).toEqual({
      error: 'Not your photo',
    })
    const after = await reread(row.id)
    expect(after.caption).toBe('Theirs')
    expect(after.year).toBe(2020)
    expect(await testDb.select().from(activityLog)).toHaveLength(0)
  })

  it('CAP-015 · A content admin can fix any member’s photo — year and caption', async () => {
    mockUser(ME, { siteOwner: true })
    const row = await seedPhoto({ uploadedBy: OTHER, caption: 'Old', year: 2026 })
    expect(await updatePhoto(row.id, { year: 2025, caption: 'Fixed by admin' })).toEqual({
      ok: true,
    })
    const after = await reread(row.id)
    expect(after.year).toBe(2025)
    expect(after.caption).toBe('Fixed by admin')
  })
})
