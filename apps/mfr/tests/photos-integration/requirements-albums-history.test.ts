// Requirements coverage (CAP-013 Photo albums, CAP-018 Photo history): the
// By Uploader grouping with real identity users (names, email fallback,
// alphabetical order) and the 100-event history limit, against the real test
// branch. Identity rows are created here and removed by id afterwards.

import { describe, it, expect, afterEach, vi } from 'vitest'

// The gallery and history readers load the auth module, which pulls in
// next-auth; mock it as the other photos integration files do.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { inArray } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { testDb } from './testDb'
import { testIdentityDb } from './testIdentityDb'
import { portalPhotos, activityLog } from '../../lib/db/schema'
import { photoValues } from './requirementsHelpers'
import { getAlbumSections } from '../../lib/photos/gallery'
import { getPhotoHistory } from '../../lib/photos/history'

const ZED = 'a0000000-0000-4000-8000-00000000000a'
const AMY = 'b0000000-0000-4000-8000-00000000000b'
const SAM = 'c0000000-0000-4000-8000-00000000000c'
const createdUsers = [ZED, AMY, SAM]

afterEach(async () => {
  await testDb.delete(portalPhotos)
  await testDb.delete(activityLog)
  await testIdentityDb.delete(users).where(inArray(users.id, createdUsers))
})

async function seedUsers() {
  await testIdentityDb.insert(users).values([
    {
      id: ZED,
      email: 'zed@requirements-photos.example.com',
      name: 'Zed Miller',
      status: 'approved',
    },
    {
      id: AMY,
      email: 'amy@requirements-photos.example.com',
      name: 'Amy Miller',
      status: 'approved',
    },
    // No display name: shown by the part of the email before the "@".
    {
      id: SAM,
      email: 'sam.miller@requirements-photos.example.com',
      name: null,
      status: 'approved',
    },
  ])
}

describe('CAP-013 Photo albums — By Uploader', () => {
  it('CAP-013 · Switching to By Uploader groups photos by who added them — one section per person, alphabetical', async () => {
    await seedUsers()
    await testDb
      .insert(portalPhotos)
      .values([
        photoValues({ uploadedBy: ZED, year: 2026 }),
        photoValues({ uploadedBy: ZED, year: 2024 }),
        photoValues({ uploadedBy: ZED, year: 2026 }),
        photoValues({ uploadedBy: AMY, year: 2025 }),
        photoValues({ uploadedBy: SAM, year: 2026 }),
      ])

    const { byUploader } = await getAlbumSections(AMY)
    expect(byUploader.map((s) => s.id)).toEqual([AMY, SAM, ZED])
    expect(byUploader.map((s) => s.subtitle)).toEqual(['1 photo', '1 photo', '3 photos'])
    // Each person's photos under year sub-headings, newest year first.
    expect(byUploader[2].blocks.map((b) => b.label)).toEqual(['2026', '2024'])
    expect(byUploader[2].blocks[0].photos).toHaveLength(2)
  })

  it('CAP-013 · An uploader with no display name is shown by their email name', async () => {
    await seedUsers()
    await testDb.insert(portalPhotos).values(photoValues({ uploadedBy: SAM }))

    const { byUploader } = await getAlbumSections(ZED)
    expect(byUploader.map((s) => s.title)).toEqual(['sam.miller'])
  })
})

describe('CAP-018 Photo history — limit', () => {
  it('CAP-018 · Newest changes come first, up to the latest 100', async () => {
    // Far-future stamps keep these the newest even if other photo events exist.
    const base = Date.UTC(2099, 0, 1)
    await testDb.insert(activityLog).values(
      Array.from({ length: 120 }, (_, i) => ({
        eventType: 'photo_uploaded',
        actorUserId: null,
        metadata: { year: 2026, n: i },
        createdAt: new Date(base + i * 60_000), // event n is n minutes after base
      })),
    )

    const { events } = await getPhotoHistory()
    expect(events).toHaveLength(100)
    // The 100 most recent (n = 119 … 20), newest first.
    const ns = events.map((e) => (e.metadata as { n: number }).n)
    expect(ns[0]).toBe(119)
    expect(ns[99]).toBe(20)
    expect(ns).toEqual([...ns].sort((a, b) => b - a))
  })
})
