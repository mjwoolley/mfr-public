// Integration: the photo-slide admin actions against the real test branch.
// auth, next/cache, and the Blob wrapper are mocked; the DB writes are real.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { testDb } from './testDb'
import { portalPhotoSlides } from '../../lib/db/schema'

// See reservations-integration/reservations.test.ts for why auth is mocked.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const putSlideImage = vi.fn()
const deleteSlideImage = vi.fn()
vi.mock('../../lib/photos/blobStore', () => ({
  putSlideImage: (...a: unknown[]) => putSlideImage(...a),
  deleteSlideImage: (...a: unknown[]) => deleteSlideImage(...a),
}))

import { auth } from '@/lib/auth'
import { uploadSlides, removeSlide, reorderSlides } from '../../app/admin/photos/actions'
import { SLIDE_CAP } from '../../app/admin/photos/constants'

function mockSession(roles: { siteOwner?: boolean; siteManager?: boolean }) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: 'admin-actor',
      status: 'approved',
      roles: {
        siteOwner: roles.siteOwner ?? false,
        siteManager: roles.siteManager ?? false,
        accountingManager: false,
      },
      email: 'admin@example.com',
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function image(name: string) {
  return new File(['data'], name, { type: 'image/jpeg' })
}

afterEach(async () => {
  vi.mocked(auth).mockReset()
  putSlideImage.mockReset()
  deleteSlideImage.mockReset()
  await testDb.delete(portalPhotoSlides)
})

describe('uploadSlides', () => {
  it('a content admin uploads images, appended in order to the collection', async () => {
    mockSession({ siteManager: true })
    let n = 0
    putSlideImage.mockImplementation(async (f: File) => {
      n += 1
      return { url: `https://blob/${f.name}`, pathname: `photo-slides/${n}-${f.name}` }
    })

    const result = await uploadSlides('2026', [image('a.jpg'), image('b.jpg')])
    expect(result).toEqual({ ok: true })
    expect(putSlideImage).toHaveBeenCalledTimes(2)

    const rows = await testDb.select().from(portalPhotoSlides)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.collection)).toEqual(['2026', '2026'])
    expect([...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.sortOrder)).toEqual([
      0, 1,
    ])
  })

  it('rejects when the upload would exceed the per-collection cap', async () => {
    mockSession({ siteManager: true })
    putSlideImage.mockResolvedValue({ url: 'https://blob/x', pathname: 'photo-slides/x' })
    const tooMany = Array.from({ length: SLIDE_CAP + 1 }, (_, i) => image(`p${i}.jpg`))
    const result = await uploadSlides('highlights', tooMany)
    expect(result).toEqual({ error: `Each collection holds up to ${SLIDE_CAP} photos.` })
    expect(await testDb.select().from(portalPhotoSlides)).toHaveLength(0)
  })

  it('rejects an invalid collection', async () => {
    mockSession({ siteManager: true })
    const result = await uploadSlides('not-a-year', [image('a.jpg')])
    expect(result).toEqual({ error: 'Invalid collection' })
  })

  it('rejects a non-image file', async () => {
    mockSession({ siteManager: true })
    const result = await uploadSlides('2026', [new File(['x'], 'note.txt', { type: 'text/plain' })])
    expect(result).toEqual({ error: 'Only image files can be uploaded.' })
  })

  it('redirects (rejects) a non-content-admin', async () => {
    mockSession({ siteManager: false, siteOwner: false })
    await expect(uploadSlides('2026', [image('a.jpg')])).rejects.toThrow()
    expect(putSlideImage).not.toHaveBeenCalled()
  })
})

describe('removeSlide', () => {
  it('deletes the row and the underlying blob', async () => {
    mockSession({ siteManager: true })
    deleteSlideImage.mockResolvedValue(undefined)
    const [row] = await testDb
      .insert(portalPhotoSlides)
      .values({
        collection: '2026',
        blobUrl: 'https://blob/pic.jpg',
        blobPathname: 'photo-slides/pic.jpg',
        sortOrder: 0,
        uploadedBy: 'admin-actor',
      })
      .returning()

    const result = await removeSlide(row.id)
    expect(result).toEqual({ ok: true })
    expect(deleteSlideImage).toHaveBeenCalledWith('https://blob/pic.jpg')
    expect(await testDb.select().from(portalPhotoSlides)).toHaveLength(0)
  })
})

describe('reorderSlides', () => {
  it('rewrites sort_order to match the given id order', async () => {
    mockSession({ siteManager: true })
    const inserted = await testDb
      .insert(portalPhotoSlides)
      .values([
        { collection: '2026', blobUrl: 'a', blobPathname: 'a', sortOrder: 0, uploadedBy: 'x' },
        { collection: '2026', blobUrl: 'b', blobPathname: 'b', sortOrder: 1, uploadedBy: 'x' },
        { collection: '2026', blobUrl: 'c', blobPathname: 'c', sortOrder: 2, uploadedBy: 'x' },
      ])
      .returning()
    const [a, b, c] = inserted

    // New order: c, a, b
    await reorderSlides('2026', [c.id, a.id, b.id])

    const rows = await testDb.select().from(portalPhotoSlides)
    const orderById = new Map(rows.map((r) => [r.id, r.sortOrder]))
    expect(orderById.get(c.id)).toBe(0)
    expect(orderById.get(a.id)).toBe(1)
    expect(orderById.get(b.id)).toBe(2)
  })
})
