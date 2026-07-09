import { describe, it, expect } from 'vitest'
import { isOverlapError } from './isOverlapError'

describe('isOverlapError', () => {
  it('returns true for the exclusion-constraint violation code 23P01', () => {
    expect(isOverlapError({ cause: { code: '23P01' } })).toBe(true)
  })

  it('returns true when the trigger message contains reservation_overlaps_blocked_date', () => {
    expect(
      isOverlapError({ cause: { message: 'error: reservation_overlaps_blocked_date' } })
    ).toBe(true)
  })

  it('returns true when the trigger message contains blocked_date_overlaps_reservation', () => {
    expect(
      isOverlapError({ cause: { message: 'error: blocked_date_overlaps_reservation' } })
    ).toBe(true)
  })

  it('returns false for an unrelated postgres error code', () => {
    expect(isOverlapError({ cause: { code: '23505', message: 'duplicate key' } })).toBe(false)
  })

  it('returns false when there is no cause', () => {
    expect(isOverlapError(new Error('plain error'))).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isOverlapError(null)).toBe(false)
    expect(isOverlapError(undefined)).toBe(false)
    expect(isOverlapError('a string')).toBe(false)
  })
})
