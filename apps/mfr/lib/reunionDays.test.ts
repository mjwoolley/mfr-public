import { describe, it, expect } from 'vitest'
import { buildDays } from './reunionDays'

describe('buildDays', () => {
  it('returns an empty list for missing or invalid ranges', () => {
    expect(buildDays(null, null)).toEqual([])
    expect(buildDays('2026-07-05', '2026-07-01')).toEqual([]) // end before start
    expect(buildDays('2026-07-01', undefined)).toEqual([])
  })

  it('builds an inclusive day list with 1-based indices and labels', () => {
    const days = buildDays('2026-07-01', '2026-07-05')
    expect(days).toHaveLength(5)
    expect(days[0]).toMatchObject({ index: 1, dow: 'Wed', date: 'Jul 1' })
    expect(days[4]).toMatchObject({ index: 5, dow: 'Sun', date: 'Jul 5' })
  })

  it('caps the range at 21 days', () => {
    const days = buildDays('2026-07-01', '2026-08-31')
    expect(days).toHaveLength(21)
  })

  it('handles a single-day reunion', () => {
    const days = buildDays('2026-07-04', '2026-07-04')
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ index: 1, date: 'Jul 4' })
  })
})
