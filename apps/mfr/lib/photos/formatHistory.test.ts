import { describe, it, expect } from 'vitest'
import { formatPhotoEvent, type PhotoHistoryEvent, type UserNameMap } from './formatHistory'

const users: UserNameMap = {
  'user-jane': 'Jane',
  'user-null': null,
}

function makeEvent(overrides: Partial<PhotoHistoryEvent>): PhotoHistoryEvent {
  return {
    id: 'evt-1',
    eventType: 'photo_uploaded',
    actorUserId: 'user-jane',
    metadata: { year: 2026 },
    createdAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('formatPhotoEvent', () => {
  it('formats an upload with the year', () => {
    expect(formatPhotoEvent(makeEvent({ eventType: 'photo_uploaded' }), users)).toBe(
      'Jane added a 2026 photo.',
    )
  })

  it('formats a delete', () => {
    expect(formatPhotoEvent(makeEvent({ eventType: 'photo_deleted' }), users)).toBe(
      'Jane deleted a 2026 photo.',
    )
  })

  it('formats a caption edit with the new caption', () => {
    const event = makeEvent({
      eventType: 'photo_caption_edited',
      metadata: { year: 2026, caption: '  On the dock  ' },
    })
    expect(formatPhotoEvent(event, users)).toBe('Jane captioned a 2026 photo: “On the dock”.')
  })

  it('formats a caption clear (blank caption) without quotes', () => {
    const event = makeEvent({
      eventType: 'photo_caption_edited',
      metadata: { year: 2026, caption: '   ' },
    })
    expect(formatPhotoEvent(event, users)).toBe('Jane edited the caption on a 2026 photo.')
  })

  it('formats a caption edit with a non-string caption as a plain edit', () => {
    const event = makeEvent({ eventType: 'photo_caption_edited', metadata: { year: 2026 } })
    expect(formatPhotoEvent(event, users)).toBe('Jane edited the caption on a 2026 photo.')
  })

  it('formats feature and unfeature', () => {
    expect(formatPhotoEvent(makeEvent({ eventType: 'photo_featured' }), users)).toBe(
      'Jane featured a 2026 photo on the home page.',
    )
    expect(formatPhotoEvent(makeEvent({ eventType: 'photo_unfeatured' }), users)).toBe(
      'Jane unfeatured a 2026 photo.',
    )
  })

  it('omits the year when metadata has none', () => {
    const event = makeEvent({ eventType: 'photo_uploaded', metadata: {} })
    expect(formatPhotoEvent(event, users)).toBe('Jane added a photo.')
  })

  it('accepts a string year in metadata', () => {
    const event = makeEvent({ eventType: 'photo_uploaded', metadata: { year: '2025' } })
    expect(formatPhotoEvent(event, users)).toBe('Jane added a 2025 photo.')
  })

  it('renders an unknown actor id as a former member', () => {
    const event = makeEvent({ actorUserId: 'ghost' })
    expect(formatPhotoEvent(event, users)).toBe('A former member added a 2026 photo.')
  })

  it('renders a known-but-nameless actor as a former member', () => {
    const event = makeEvent({ actorUserId: 'user-null' })
    expect(formatPhotoEvent(event, users)).toBe('A former member added a 2026 photo.')
  })

  it('renders a null actor as Someone', () => {
    const event = makeEvent({ actorUserId: null })
    expect(formatPhotoEvent(event, users)).toBe('Someone added a 2026 photo.')
  })

  it('falls back gracefully for an unknown event type', () => {
    const event = makeEvent({ eventType: 'photo_teleported' })
    expect(formatPhotoEvent(event, users)).toBe('Jane performed an action (photo_teleported).')
  })
})
