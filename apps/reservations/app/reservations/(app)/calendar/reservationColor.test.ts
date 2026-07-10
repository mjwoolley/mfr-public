import { describe, it, expect } from 'vitest'
import { colorForUser } from './reservationColor'

describe('colorForUser', () => {
  it('returns the same color for the same user id every time', () => {
    expect(colorForUser('user-123')).toEqual(colorForUser('user-123'))
  })

  it('assigns different colors across a handful of different user ids', () => {
    const ids = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5']
    const colors = new Set(ids.map((id) => colorForUser(id).bg))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('always returns a valid Tailwind bg/text pair', () => {
    const color = colorForUser('any-user-id')
    expect(color.bg).toMatch(/^bg-\w+-200$/)
    expect(color.text).toMatch(/^text-\w+-900$/)
  })
})
