import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB client so we can assert what gets inserted and simulate failures
// without a real connection.
const insert = vi.fn()
vi.mock('@/lib/portalDb', () => ({ portalDb: { insert: (...a: unknown[]) => insert(...a) } }))

import { logPhotoActivity, PHOTO_EVENT_TYPES } from './logPhotoActivity'

beforeEach(() => insert.mockReset())

describe('logPhotoActivity', () => {
  it('inserts an activity_log row, defaulting metadata to {}', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    insert.mockReturnValue({ values })

    await logPhotoActivity({ eventType: 'photo_uploaded', actorUserId: 'actor-1' })

    expect(values).toHaveBeenCalledWith({
      eventType: 'photo_uploaded',
      actorUserId: 'actor-1',
      metadata: {},
    })
  })

  it('passes provided metadata through', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    insert.mockReturnValue({ values })

    await logPhotoActivity({
      eventType: 'photo_featured',
      actorUserId: 'actor-1',
      metadata: { photoId: 'p1', year: 2026 },
    })

    expect(values).toHaveBeenCalledWith({
      eventType: 'photo_featured',
      actorUserId: 'actor-1',
      metadata: { photoId: 'p1', year: 2026 },
    })
  })

  it('never throws when the insert fails (best-effort logging)', async () => {
    insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error('db down')) })

    await expect(
      logPhotoActivity({ eventType: 'photo_deleted', actorUserId: 'actor-1' }),
    ).resolves.toBeUndefined()
  })

  it('exports the five photo event types', () => {
    expect(PHOTO_EVENT_TYPES).toEqual([
      'photo_uploaded',
      'photo_deleted',
      'photo_caption_edited',
      'photo_featured',
      'photo_unfeatured',
    ])
  })
})
